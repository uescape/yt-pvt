import {
  presetFor,
  profileInputSchema,
  profileKindSchema,
  type CreateHouseholdResponse,
  type HomeResponse,
  type HouseholdResponse,
  type PreviewResponse,
  type Profile,
  type TvProfileSummary,
  type TvSessionResponse,
} from '@curato/core';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { z, ZodError } from 'zod';
import { hashPin, randomId, randomToken, sha256Hex, verifyPin } from './lib/crypto';
import { HttpError, badRequest, notFound, tooMany } from './lib/errors';
import { Catalog } from './services/catalog';
import { buildHome } from './services/feed';
import { PairingService } from './services/pairing';
import type { ProfileRow, Store, TokenKind } from './store/types';
import { YouTubeClient } from './youtube/client';
import { QuotaGuard } from './youtube/quota';

export interface Deps {
  store: Store;
  youtubeApiKey: string;
  quotaDailyBudget: number;
  searchesPerHouseholdPerDay: number;
  now?: () => Date;
  fetch?: typeof fetch;
}

export interface Services {
  store: Store;
  catalog: Catalog;
  pairing: PairingService;
  quota: QuotaGuard;
  now: () => Date;
}

export function createServices(deps: Deps): Services {
  const now = deps.now ?? (() => new Date());
  const quota = new QuotaGuard(deps.store, deps.quotaDailyBudget, now);
  const youtube = new YouTubeClient({ apiKey: deps.youtubeApiKey, quota, fetch: deps.fetch });
  const catalog = new Catalog({ store: deps.store, youtube, now, searchesPerHouseholdPerDay: deps.searchesPerHouseholdPerDay });
  return { store: deps.store, catalog, pairing: new PairingService({ store: deps.store, now }), quota, now };
}

interface AuthInfo {
  householdId: string;
  tokenId: string;
  kind: TokenKind;
}

type AppEnv = { Variables: { svc: Services; auth: AuthInfo } };
type Ctx = Context<AppEnv>;

const TOUCH_INTERVAL_MS = 5 * 60_000;
const PIN_ATTEMPTS_PER_10_MIN = 5;

const regionSchema = z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase());
const pinSchema = z.string().regex(/^\d{4,8}$/, 'PIN must be 4–8 digits');

async function json<T extends z.ZodTypeAny>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('Request body must be JSON');
  }
  return schema.parse(body);
}

function requireAuth(kind: TokenKind): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
    const svc = c.get('svc');
    const row = await svc.store.getTokenByHash(await sha256Hex(token));
    if (!row || row.kind !== kind) throw new HttpError(401, 'unauthorized', 'Invalid or revoked token');
    const now = svc.now();
    if (!row.lastSeenAt || now.getTime() - Date.parse(row.lastSeenAt) > TOUCH_INTERVAL_MS) {
      await svc.store.touchToken(row.id, now.toISOString());
    }
    c.set('auth', { householdId: row.householdId, tokenId: row.id, kind: row.kind });
    await next();
  };
}

const toProfile = (r: ProfileRow): Profile => ({ id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, ...r.data });
const toSummary = (r: ProfileRow): TvProfileSummary => ({
  id: r.id,
  name: r.data.name,
  kind: r.data.kind,
  avatar: r.data.avatar,
  pinToEnter: r.data.pinToEnter,
});

/** Runs work after the response on Workers; awaits it elsewhere (tests, Node). */
function background(c: Ctx, work: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    void work;
  }
}

async function householdOr404(svc: Services, id: string) {
  const h = await svc.store.getHousehold(id);
  if (!h) throw notFound('Household');
  return h;
}

/**
 * Builds the HTTP app. `makeDeps` runs per request so the same code serves Workers (bindings arrive per request)
 * and tests (in-memory store, fake fetch).
 */
export function createApp(makeDeps: (env: unknown) => Deps) {
  const app = new Hono<AppEnv>();

  app.use('/v1/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], maxAge: 86400 }));
  app.use('/v1/*', async (c, next) => {
    c.set('svc', createServices(makeDeps(c.env)));
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, message: err.message }, err.status);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return c.json({ error: 'invalid', message: first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request' }, 400);
    }
    console.error(err);
    return c.json({ error: 'internal', message: 'Something went wrong' }, 500);
  });

  app.get('/v1/health', async (c) => c.json({ ok: true, quotaUsedToday: await c.get('svc').quota.used() }));

  /* ------------------------------------------------------------------ */
  /* Household (parent phone)                                            */
  /* ------------------------------------------------------------------ */

  app.post('/v1/households', async (c) => {
    const body = await json(c, z.object({ region: regionSchema.optional(), deviceName: z.string().max(40).optional(), pin: pinSchema.optional() }));
    const svc = c.get('svc');
    const now = svc.now().toISOString();
    const householdId = randomId();
    const pin = body.pin ? await hashPin(body.pin) : null;
    await svc.store.createHousehold({ id: householdId, region: body.region ?? 'US', pinHash: pin?.hash ?? null, pinSalt: pin?.salt ?? null, createdAt: now });
    const token = randomToken();
    await svc.store.insertToken({
      id: randomId(),
      tokenHash: await sha256Hex(token),
      householdId,
      kind: 'manager',
      name: body.deviceName ?? 'Phone',
      platform: 'mobile',
      createdAt: now,
      lastSeenAt: now,
    });
    return c.json<CreateHouseholdResponse>({ householdId, token }, 201);
  });

  // Auth is attached per route: router-level `use('*')` would also catch the public /v1/tv/pair routes.
  const manager = new Hono<AppEnv>();
  const mgr = requireAuth('manager');

  manager.get('/household', mgr, async (c) => {
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const h = await householdOr404(svc, householdId);
    const devices = await svc.store.listTokens(householdId, 'tv');
    return c.json<HouseholdResponse>({
      id: h.id,
      region: h.region,
      hasPin: !!h.pinHash,
      devices: devices.map((d) => ({ id: d.id, name: d.name, platform: d.platform, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt })),
    });
  });

  manager.put('/household', mgr, async (c) => {
    const body = await json(c, z.object({ region: regionSchema.optional(), pin: pinSchema.nullable().optional() }));
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    if (body.region) await svc.store.updateHousehold(householdId, { region: body.region });
    if (body.pin !== undefined) {
      const pin = body.pin ? await hashPin(body.pin) : null;
      await svc.store.updateHousehold(householdId, { pinHash: pin?.hash ?? null, pinSalt: pin?.salt ?? null });
    }
    return c.json({ ok: true });
  });

  manager.post('/pair/claim', mgr, async (c) => {
    const body = await json(c, z.object({ code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'), deviceName: z.string().max(40).default('TV') }));
    await c.get('svc').pairing.claim(c.get('auth').householdId, body.code, body.deviceName);
    return c.json({ ok: true });
  });

  manager.delete('/devices/:id', mgr, async (c) => {
    const ok = await c.get('svc').store.deleteToken(c.get('auth').householdId, c.req.param('id'));
    if (!ok) throw notFound('Device');
    return c.json({ ok: true });
  });

  /* Profiles */

  manager.get('/profiles', mgr, async (c) => {
    const rows = await c.get('svc').store.listProfiles(c.get('auth').householdId);
    return c.json({ profiles: rows.map(toProfile) });
  });

  manager.post('/profiles', mgr, async (c) => {
    const body = await json(c, z.union([profileInputSchema, z.object({ preset: profileKindSchema, name: z.string().trim().min(1).max(30).optional() })]));
    const input = 'preset' in body ? presetFor(body.preset, body.name) : body;
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const existing = await svc.store.listProfiles(householdId);
    if (existing.length >= 12) throw badRequest('A household can have at most 12 profiles');
    const now = svc.now().toISOString();
    const row: ProfileRow = { id: randomId(), householdId, position: existing.length, data: input, createdAt: now, updatedAt: now };
    await svc.store.insertProfile(row);
    return c.json(toProfile(row), 201);
  });

  manager.get('/profiles/:id', mgr, async (c) => {
    const row = await c.get('svc').store.getProfile(c.get('auth').householdId, c.req.param('id'));
    if (!row) throw notFound('Profile');
    return c.json(toProfile(row));
  });

  manager.put('/profiles/:id', mgr, async (c) => {
    const input = await json(c, profileInputSchema);
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const ok = await svc.store.updateProfile(householdId, c.req.param('id'), input, svc.now().toISOString());
    if (!ok) throw notFound('Profile');
    // Warm the cache for newly added channels so the TV shows them immediately.
    background(c, svc.catalog.ensureFresh(input.rules.channels).catch(() => undefined));
    const row = await svc.store.getProfile(householdId, c.req.param('id'));
    return c.json(toProfile(row!));
  });

  manager.delete('/profiles/:id', mgr, async (c) => {
    const ok = await c.get('svc').store.deleteProfile(c.get('auth').householdId, c.req.param('id'));
    if (!ok) throw notFound('Profile');
    return c.json({ ok: true });
  });

  manager.get('/profiles/:id/preview', mgr, async (c) => {
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const [row, h] = await Promise.all([svc.store.getProfile(householdId, c.req.param('id')), householdOr404(svc, householdId)]);
    if (!row) throw notFound('Profile');
    const home = await buildHome(svc, row.data, h.region);
    return c.json<PreviewResponse>({ profile: toSummary(row), player: row.data.player, generatedAt: svc.now().toISOString(), ...home });
  });

  /* Channels */

  manager.get('/channels', mgr, async (c) => {
    const ids = (c.req.query('ids') ?? '').split(',').filter((id) => /^UC[\w-]{22}$/.test(id)).slice(0, 200);
    return c.json({ channels: await c.get('svc').catalog.getChannels(ids) });
  });

  manager.get('/channels/resolve', mgr, async (c) => {
    const input = (c.req.query('input') ?? '').trim();
    if (!input) throw badRequest('input is required');
    const svc = c.get('svc');
    const h = await householdOr404(svc, c.get('auth').householdId);
    return c.json({ channel: await svc.catalog.resolveChannel(input, h.id, h.region) });
  });

  manager.get('/channels/search', mgr, async (c) => {
    const svc = c.get('svc');
    const h = await householdOr404(svc, c.get('auth').householdId);
    return c.json({ channels: await svc.catalog.searchChannels(c.req.query('q') ?? '', h.id, h.region) });
  });

  app.route('/v1', manager);

  /* ------------------------------------------------------------------ */
  /* TV                                                                  */
  /* ------------------------------------------------------------------ */

  app.post('/v1/tv/pair/start', async (c) => {
    const body = await json(c, z.object({ platform: z.string().max(20).default('unknown') }));
    return c.json(await c.get('svc').pairing.start(body.platform), 201);
  });

  app.get('/v1/tv/pair/:id', async (c) => {
    const poll = c.req.query('poll') ?? '';
    return c.json(await c.get('svc').pairing.status(c.req.param('id'), poll));
  });

  const tv = new Hono<AppEnv>();
  const tvAuth = requireAuth('tv');

  tv.get('/session', tvAuth, async (c) => {
    const svc = c.get('svc');
    const { householdId, tokenId } = c.get('auth');
    const [h, rows] = await Promise.all([householdOr404(svc, householdId), svc.store.listProfiles(householdId)]);
    return c.json<TvSessionResponse>({ deviceId: tokenId, hasPin: !!h.pinHash, profiles: rows.map(toSummary) });
  });

  tv.delete('/session', tvAuth, async (c) => {
    const { householdId, tokenId } = c.get('auth');
    await c.get('svc').store.deleteToken(householdId, tokenId);
    return c.json({ ok: true });
  });

  tv.get('/profiles/:id/home', tvAuth, async (c) => {
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const [row, h] = await Promise.all([svc.store.getProfile(householdId, c.req.param('id')), householdOr404(svc, householdId)]);
    if (!row) throw notFound('Profile');
    const home = await buildHome(svc, row.data, h.region);
    c.header('Cache-Control', 'private, max-age=60');
    return c.json<HomeResponse>({ profile: toSummary(row), player: row.data.player, rows: home.rows, generatedAt: svc.now().toISOString() });
  });

  tv.post('/verify-pin', tvAuth, async (c) => {
    const { pin } = await json(c, z.object({ pin: z.string().max(8) }));
    const svc = c.get('svc');
    const { householdId } = c.get('auth');
    const h = await householdOr404(svc, householdId);
    if (!h.pinHash || !h.pinSalt) return c.json({ ok: true });
    const bucket = Math.floor(svc.now().getTime() / 600_000);
    if ((await svc.store.incrementCounter(`pin:${householdId}:${bucket}`, 1)) > PIN_ATTEMPTS_PER_10_MIN) {
      throw tooMany('Too many wrong PINs. Wait 10 minutes.');
    }
    return c.json({ ok: await verifyPin(pin, h.pinHash, h.pinSalt) });
  });

  /** The TV reports videos the embedded player refused (embedding disabled, removed...) so nobody gets them again. */
  tv.post('/report-unplayable', tvAuth, async (c) => {
    const { videoId } = await json(c, z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }));
    await c.get('svc').store.markVideoUnplayable(videoId);
    return c.json({ ok: true });
  });

  app.route('/v1/tv', tv);

  app.all('/v1/*', () => {
    throw notFound('Route');
  });

  return app;
}
