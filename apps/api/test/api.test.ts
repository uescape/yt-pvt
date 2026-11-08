import { kidsPreset, type HomeResponse, type PreviewResponse, type Profile } from '@curato/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Deps } from '../src/app';
import { MemoryStore } from '../src/store/memory';
import { runScheduledRefresh } from '../src/worker';
import { quotaDay } from '../src/youtube/quota';
import { FakeYouTube } from './fake-youtube';

const KIDS_CH = 'UCkidskidskidskidskidsAA';
const SCI_CH = 'UCscisciscisciscisciscAA';
const BAD_CH = 'UCbadbadbadbadbadbadbaAA';

let store: MemoryStore;
let yt: FakeYouTube;
let clock: Date;
let deps: Deps;
let app: ReturnType<typeof createApp>;

async function call<T = unknown>(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function setupHousehold(pin = '1234') {
  const { body } = await call<{ token: string }>('POST', '/v1/households', { body: { region: 'pk', pin } });
  return body.token;
}

async function pairTv(managerToken: string) {
  const start = await call<{ pairingId: string; code: string; pollToken: string }>('POST', '/v1/tv/pair/start', { body: { platform: 'tizen' } });
  const pending = await call<{ status: string }>('GET', `/v1/tv/pair/${start.body.pairingId}?poll=${start.body.pollToken}`);
  expect(pending.body.status).toBe('pending');
  expect((await call('POST', '/v1/pair/claim', { token: managerToken, body: { code: start.body.code, deviceName: 'Living room' } })).status).toBe(200);
  const paired = await call<{ status: string; deviceToken: string }>('GET', `/v1/tv/pair/${start.body.pairingId}?poll=${start.body.pollToken}`);
  expect(paired.body.status).toBe('paired');
  // A token is issued exactly once.
  const again = await call<{ status: string }>('GET', `/v1/tv/pair/${start.body.pairingId}?poll=${start.body.pollToken}`);
  expect(again.body.status).toBe('expired');
  return paired.body.deviceToken;
}

beforeEach(() => {
  store = new MemoryStore();
  yt = new FakeYouTube();
  clock = new Date('2026-03-01T12:00:00Z');
  deps = { store, youtubeApiKey: 'test-key', quotaDailyBudget: 9000, searchesPerHouseholdPerDay: 2, now: () => clock, fetch: yt.fetch };
  app = createApp(() => deps);

  yt.addChannel(KIDS_CH, 'Happy Kids Science', '@happykids');
  yt.addChannel(SCI_CH, 'Deep Science', '@deepsci');
  yt.addChannel(BAD_CH, 'Prank Central', '@pranks');
  yt.addVideo({ id: 'kidsVideo01', channelId: KIDS_CH, title: 'Why is the sky blue?', publishedAt: '2026-02-20T00:00:00Z' });
  yt.addVideo({ id: 'kidsVideo02', channelId: KIDS_CH, title: 'Volcano slime experiment', publishedAt: '2026-02-21T00:00:00Z' });
  yt.addVideo({ id: 'kidsShort01', channelId: KIDS_CH, title: 'Quick fact', duration: 'PT40S', vertical: true, publishedAt: '2026-02-22T00:00:00Z' });
  yt.addVideo({ id: 'kidsLive001', channelId: KIDS_CH, title: 'Live Q&A', live: 'live', duration: 'P0D', publishedAt: '2026-02-23T00:00:00Z' });
  yt.addVideo({ id: 'kidsLong001', channelId: KIDS_CH, title: 'Full movie', duration: 'PT1H30M', publishedAt: '2026-02-19T00:00:00Z' });
  yt.addVideo({ id: 'sciVideo001', channelId: SCI_CH, title: 'Quantum physics explained', madeForKids: false, publishedAt: '2026-02-24T00:00:00Z' });
  yt.addVideo({ id: 'badVideo001', channelId: BAD_CH, title: 'Crazy prank', madeForKids: false, categoryId: '24', publishedAt: '2026-02-25T00:00:00Z' });
  yt.addVideo({ id: 'noEmbed0001', channelId: SCI_CH, title: 'Not embeddable', madeForKids: false, embeddable: false, publishedAt: '2026-02-26T00:00:00Z' });
  yt.trending['PK:28'] = ['sciVideo001', 'badVideo001', 'noEmbed0001'];
});

describe('household + pairing', () => {
  it('rejects missing or wrong tokens', async () => {
    expect((await call('GET', '/v1/profiles')).status).toBe(401);
    expect((await call('GET', '/v1/profiles', { token: 'nope' })).status).toBe(401);
  });

  it('pairs a TV and keeps manager and TV tokens separate', async () => {
    const manager = await setupHousehold();
    const tv = await pairTv(manager);
    expect((await call('GET', '/v1/tv/session', { token: tv })).status).toBe(200);
    expect((await call('GET', '/v1/profiles', { token: tv })).status).toBe(401);
    expect((await call('GET', '/v1/tv/session', { token: manager })).status).toBe(401);

    const household = await call<{ devices: Array<{ id: string; name: string; platform: string }> }>('GET', '/v1/household', { token: manager });
    expect(household.body.devices).toMatchObject([{ name: 'Living room', platform: 'tizen' }]);

    // Parent unlinks the TV -> its token stops working.
    await call('DELETE', `/v1/devices/${household.body.devices[0]!.id}`, { token: manager });
    expect((await call('GET', '/v1/tv/session', { token: tv })).status).toBe(401);
  });

  it('expires pairing codes', async () => {
    const manager = await setupHousehold();
    const start = await call<{ code: string; pairingId: string; pollToken: string }>('POST', '/v1/tv/pair/start', { body: {} });
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await call('POST', '/v1/pair/claim', { token: manager, body: { code: start.body.code } })).status).toBe(404);
    expect((await call<{ status: string }>('GET', `/v1/tv/pair/${start.body.pairingId}?poll=${start.body.pollToken}`)).body.status).toBe('expired');
  });

  it('rejects a wrong poll token', async () => {
    const start = await call<{ pairingId: string }>('POST', '/v1/tv/pair/start', { body: {} });
    expect((await call('GET', `/v1/tv/pair/${start.body.pairingId}?poll=wrong`)).status).toBe(404);
  });

  it('verifies the PIN and rate-limits guesses', async () => {
    const manager = await setupHousehold('4321');
    const tv = await pairTv(manager);
    expect((await call<{ ok: boolean }>('POST', '/v1/tv/verify-pin', { token: tv, body: { pin: '4321' } })).body.ok).toBe(true);
    expect((await call<{ ok: boolean }>('POST', '/v1/tv/verify-pin', { token: tv, body: { pin: '0000' } })).body.ok).toBe(false);
    for (let i = 0; i < 3; i++) await call('POST', '/v1/tv/verify-pin', { token: tv, body: { pin: '0000' } });
    expect((await call('POST', '/v1/tv/verify-pin', { token: tv, body: { pin: '4321' } })).status).toBe(429);
  });
});

describe('profiles + feed', () => {
  async function kidsProfile(manager: string, channels: string[]) {
    const created = await call<Profile>('POST', '/v1/profiles', { token: manager, body: { preset: 'kids', name: 'Ali' } });
    expect(created.status).toBe(201);
    const { id, createdAt, updatedAt, ...input } = created.body;
    void createdAt;
    void updatedAt;
    const updated = await call<Profile>('PUT', `/v1/profiles/${id}`, {
      token: manager,
      body: { ...input, rules: { ...input.rules, channels, blockedKeywords: ['slime'] } },
    });
    expect(updated.status).toBe(200);
    return id;
  }

  it('kids home only contains allowed, safe videos', async () => {
    const manager = await setupHousehold();
    const tv = await pairTv(manager);
    const id = await kidsProfile(manager, [KIDS_CH, SCI_CH]);

    const home = await call<HomeResponse>('GET', `/v1/tv/profiles/${id}/home`, { token: tv });
    expect(home.status).toBe(200);
    const ids = new Set(home.body.rows.flatMap((r) => r.videos.map((v) => v.id)));
    expect([...ids]).toEqual(['kidsVideo01']);
    expect(home.body.rows.map((r) => r.title)).toEqual(['Latest', 'Happy Kids Science']);
    expect(home.body.player.privacyEnhanced).toBe(true);
  });

  it('preview explains what was hidden and why', async () => {
    const manager = await setupHousehold();
    const id = await kidsProfile(manager, [KIDS_CH, SCI_CH]);
    const preview = await call<PreviewResponse>('GET', `/v1/profiles/${id}/preview`, { token: manager });
    expect(preview.body.excluded).toEqual({
      keyword: 1,
      short: 1,
      live: 1,
      'too-long': 1,
      'not-made-for-kids': 1,
      'not-embeddable': 1,
    });
  });

  it('open mode mixes trending minus blocked channels', async () => {
    const manager = await setupHousehold();
    const tv = await pairTv(manager);
    const created = await call<Profile>('POST', '/v1/profiles', { token: manager, body: { preset: 'standard' } });
    const { id, createdAt, updatedAt, ...input } = created.body;
    void createdAt;
    void updatedAt;
    await call('PUT', `/v1/profiles/${id}`, {
      token: manager,
      body: { ...input, rules: { ...input.rules, channels: [SCI_CH], blockedChannels: [BAD_CH], trendingCategoryIds: ['28', '20'] } },
    });
    const home = await call<HomeResponse>('GET', `/v1/tv/profiles/${id}/home`, { token: tv });
    const trending = home.body.rows.find((r) => r.id === 'trending-28');
    expect(trending?.videos.map((v) => v.id)).toEqual(['sciVideo001']);
    // Category 20 has no chart in PK: silently skipped.
    expect(home.body.rows.find((r) => r.id === 'trending-20')).toBeUndefined();
  });

  it('validates profile input', async () => {
    const manager = await setupHousehold();
    const bad = await call<{ error: string }>('POST', '/v1/profiles', {
      token: manager,
      body: { ...kidsPreset(), rules: { ...kidsPreset().rules, channels: ['not-a-channel'] } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid');
  });

  it('isolates households from each other', async () => {
    const a = await setupHousehold();
    const b = await setupHousehold();
    const id = await kidsProfile(a, [KIDS_CH]);
    expect((await call('GET', `/v1/profiles/${id}`, { token: b })).status).toBe(404);
    const tvB = await pairTv(b);
    expect((await call('GET', `/v1/tv/profiles/${id}/home`, { token: tvB })).status).toBe(404);
  });

  it('removes videos the TV reports as unplayable', async () => {
    const manager = await setupHousehold();
    const tv = await pairTv(manager);
    const id = await kidsProfile(manager, [KIDS_CH]);
    await call('POST', '/v1/tv/report-unplayable', { token: tv, body: { videoId: 'kidsVideo01' } });
    const home = await call<HomeResponse>('GET', `/v1/tv/profiles/${id}/home`, { token: tv });
    expect(home.body.rows).toEqual([]);
  });
});

describe('channels + quota', () => {
  it('resolves handles, links and ids cheaply', async () => {
    const manager = await setupHousehold();
    const r1 = await call<{ channel: { id: string } }>('GET', '/v1/channels/resolve?input=%40happykids', { token: manager });
    expect(r1.body.channel.id).toBe(KIDS_CH);
    const r2 = await call<{ channel: { id: string } }>('GET', `/v1/channels/resolve?input=${encodeURIComponent('https://youtu.be/sciVideo001')}`, { token: manager });
    expect(r2.body.channel.id).toBe(SCI_CH);
    expect(yt.calls).not.toContain('search');
  });

  it('caches searches and rate-limits per household', async () => {
    const manager = await setupHousehold();
    const s1 = await call<{ channels: Array<{ id: string }> }>('GET', '/v1/channels/search?q=science', { token: manager });
    expect(s1.body.channels.map((c) => c.id).sort()).toEqual([SCI_CH, KIDS_CH].sort());
    await call('GET', '/v1/channels/search?q=science', { token: manager });
    expect(yt.calls.filter((c) => c === 'search')).toHaveLength(1);
    await call('GET', '/v1/channels/search?q=prank', { token: manager });
    expect((await call('GET', '/v1/channels/search?q=kids', { token: manager })).status).toBe(429);
  });

  it('shares the channel cache between households (2 units per channel refresh)', async () => {
    const a = await setupHousehold();
    const b = await setupHousehold();
    await call('GET', '/v1/channels/resolve?input=%40happykids', { token: a });
    const before = yt.calls.length;
    for (const m of [a, b]) {
      const created = await call<Profile>('POST', '/v1/profiles', { token: m, body: { preset: 'kids' } });
      const { id, createdAt, updatedAt, ...input } = created.body;
      void createdAt;
      void updatedAt;
      await call('PUT', `/v1/profiles/${id}`, { token: m, body: { ...input, rules: { ...input.rules, channels: [KIDS_CH] } } });
      await call('GET', `/v1/profiles/${id}/preview`, { token: m });
    }
    expect(yt.calls.length).toBe(before);
  });

  it('stops before the budget and reports quota exhaustion', async () => {
    deps.quotaDailyBudget = 100;
    const manager = await setupHousehold();
    await store.incrementCounter(`quota:${quotaDay(clock)}`, 99);
    const res = await call<{ error: string }>('GET', '/v1/channels/search?q=science', { token: manager });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('quota_exhausted');
    expect(yt.calls).toHaveLength(0);
  });

  it('treats a YouTube quotaExceeded error as exhausted for the day', async () => {
    const manager = await setupHousehold();
    yt.failWith = { status: 403, reason: 'quotaExceeded' };
    expect((await call('GET', '/v1/channels/resolve?input=%40happykids', { token: manager })).status).toBe(503);
    yt.failWith = null;
    expect((await call('GET', '/v1/channels/resolve?input=%40deepsci', { token: manager })).status).toBe(503);
  });

  it('cron refreshes stale, recently used channels', async () => {
    const manager = await setupHousehold();
    const tv = await pairTv(manager);
    const created = await call<Profile>('POST', '/v1/profiles', { token: manager, body: { preset: 'kids' } });
    const { id, createdAt, updatedAt, ...input } = created.body;
    void createdAt;
    void updatedAt;
    await call('PUT', `/v1/profiles/${id}`, { token: manager, body: { ...input, rules: { ...input.rules, channels: [KIDS_CH] } } });
    await call('GET', `/v1/tv/profiles/${id}/home`, { token: tv });

    yt.addVideo({ id: 'kidsVideo03', channelId: KIDS_CH, title: 'Brand new upload', publishedAt: '2026-03-01T13:00:00Z' });
    expect((await runScheduledRefresh(deps)).refreshed).toBe(0); // not stale yet
    clock = new Date(clock.getTime() + 4 * 3_600_000);
    expect((await runScheduledRefresh(deps)).refreshed).toBe(1);
    const home = await call<HomeResponse>('GET', `/v1/tv/profiles/${id}/home`, { token: tv });
    expect(home.body.rows[0]!.videos[0]!.id).toBe('kidsVideo03');
  });
});
