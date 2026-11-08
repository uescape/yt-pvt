import type { ProfileInput, VideoMeta } from '@curato/core';
import type { ChannelRow, HouseholdRow, PairingRow, ProfileRow, Store, TokenKind, TokenRow } from './types';

/** D1 caps bound parameters per statement at 100. */
const MAX_PARAMS = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));

const toHousehold = (r: Row): HouseholdRow => ({
  id: String(r.id),
  region: String(r.region),
  pinHash: str(r.pin_hash),
  pinSalt: str(r.pin_salt),
  createdAt: String(r.created_at),
});

const toToken = (r: Row): TokenRow => ({
  id: String(r.id),
  tokenHash: String(r.token_hash),
  householdId: String(r.household_id),
  kind: r.kind as TokenKind,
  name: String(r.name),
  platform: String(r.platform),
  createdAt: String(r.created_at),
  lastSeenAt: str(r.last_seen_at),
});

const toPairing = (r: Row): PairingRow => ({
  id: String(r.id),
  code: String(r.code),
  pollTokenHash: String(r.poll_token_hash),
  platform: String(r.platform),
  expiresAt: String(r.expires_at),
  householdId: str(r.household_id),
  deviceName: str(r.device_name),
  consumed: Number(r.consumed) === 1,
});

const toProfile = (r: Row): ProfileRow => ({
  id: String(r.id),
  householdId: String(r.household_id),
  position: Number(r.position),
  data: JSON.parse(String(r.data)) as ProfileInput,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

const toChannel = (r: Row): ChannelRow => ({
  id: String(r.id),
  title: String(r.title),
  handle: str(r.handle),
  thumbnailUrl: String(r.thumbnail_url),
  subscriberCount: r.subscriber_count == null ? null : Number(r.subscriber_count),
  uploadsPlaylistId: String(r.uploads_playlist_id),
  fetchedAt: String(r.fetched_at),
  videosRefreshedAt: str(r.videos_refreshed_at),
  lastRequestedAt: str(r.last_requested_at),
});

const toVideo = (r: Row): VideoMeta => JSON.parse(String(r.data)) as VideoMeta;

export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  private async all(sql: string, ...params: unknown[]): Promise<Row[]> {
    const res = await this.db.prepare(sql).bind(...params).all<Row>();
    return res.results ?? [];
  }
  private async first(sql: string, ...params: unknown[]): Promise<Row | null> {
    return (await this.db.prepare(sql).bind(...params).first<Row>()) ?? null;
  }
  private async run(sql: string, ...params: unknown[]): Promise<number> {
    const res = await this.db.prepare(sql).bind(...params).run();
    return res.meta.changes ?? 0;
  }

  async createHousehold(h: HouseholdRow) {
    await this.run(
      'INSERT INTO households (id, region, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?)',
      h.id, h.region, h.pinHash, h.pinSalt, h.createdAt,
    );
  }
  async getHousehold(id: string) {
    const r = await this.first('SELECT * FROM households WHERE id = ?', id);
    return r ? toHousehold(r) : null;
  }
  async updateHousehold(id: string, patch: Partial<Pick<HouseholdRow, 'region' | 'pinHash' | 'pinSalt'>>) {
    const cols: Record<string, string | null | undefined> = {
      region: patch.region,
      pin_hash: patch.pinHash,
      pin_salt: patch.pinSalt,
    };
    const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    await this.run(
      `UPDATE households SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...entries.map(([, v]) => v),
      id,
    );
  }

  async insertToken(t: TokenRow) {
    await this.run(
      'INSERT INTO tokens (id, token_hash, household_id, kind, name, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      t.id, t.tokenHash, t.householdId, t.kind, t.name, t.platform, t.createdAt, t.lastSeenAt,
    );
  }
  async getTokenByHash(hash: string) {
    const r = await this.first('SELECT * FROM tokens WHERE token_hash = ?', hash);
    return r ? toToken(r) : null;
  }
  async touchToken(id: string, at: string) {
    await this.run('UPDATE tokens SET last_seen_at = ? WHERE id = ?', at, id);
  }
  async listTokens(householdId: string, kind: TokenKind) {
    return (await this.all('SELECT * FROM tokens WHERE household_id = ? AND kind = ? ORDER BY created_at', householdId, kind)).map(toToken);
  }
  async deleteToken(householdId: string, id: string) {
    return (await this.run('DELETE FROM tokens WHERE id = ? AND household_id = ?', id, householdId)) > 0;
  }

  async insertPairing(p: PairingRow) {
    await this.run(
      'INSERT INTO pairings (id, code, poll_token_hash, platform, expires_at, household_id, device_name, consumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, p.code, p.pollTokenHash, p.platform, p.expiresAt, p.householdId, p.deviceName, p.consumed ? 1 : 0,
    );
  }
  async getPairing(id: string) {
    const r = await this.first('SELECT * FROM pairings WHERE id = ?', id);
    return r ? toPairing(r) : null;
  }
  async findActivePairingByCode(code: string, now: string) {
    const r = await this.first(
      'SELECT * FROM pairings WHERE code = ? AND consumed = 0 AND household_id IS NULL AND expires_at > ? ORDER BY expires_at DESC LIMIT 1',
      code, now,
    );
    return r ? toPairing(r) : null;
  }
  async consumePairing(id: string) {
    return (await this.run('UPDATE pairings SET consumed = 1 WHERE id = ? AND consumed = 0', id)) > 0;
  }
  async updatePairing(id: string, patch: Partial<Pick<PairingRow, 'householdId' | 'deviceName'>>) {
    const cols: Record<string, unknown> = {
      household_id: patch.householdId,
      device_name: patch.deviceName,
    };
    const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    await this.run(`UPDATE pairings SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, ...entries.map(([, v]) => v), id);
  }

  async listProfiles(householdId: string) {
    return (await this.all('SELECT * FROM profiles WHERE household_id = ? ORDER BY position, created_at', householdId)).map(toProfile);
  }
  async getProfile(householdId: string, id: string) {
    const r = await this.first('SELECT * FROM profiles WHERE id = ? AND household_id = ?', id, householdId);
    return r ? toProfile(r) : null;
  }
  async insertProfile(p: ProfileRow) {
    await this.run(
      'INSERT INTO profiles (id, household_id, position, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      p.id, p.householdId, p.position, JSON.stringify(p.data), p.createdAt, p.updatedAt,
    );
  }
  async updateProfile(householdId: string, id: string, data: ProfileInput, updatedAt: string) {
    return (await this.run('UPDATE profiles SET data = ?, updated_at = ? WHERE id = ? AND household_id = ?', JSON.stringify(data), updatedAt, id, householdId)) > 0;
  }
  async deleteProfile(householdId: string, id: string) {
    return (await this.run('DELETE FROM profiles WHERE id = ? AND household_id = ?', id, householdId)) > 0;
  }

  async upsertChannels(rows: ChannelRow[]) {
    if (rows.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO channels (id, title, handle, thumbnail_url, subscriber_count, uploads_playlist_id, fetched_at, videos_refreshed_at, last_requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, handle = excluded.handle, thumbnail_url = excluded.thumbnail_url,
         subscriber_count = excluded.subscriber_count, uploads_playlist_id = excluded.uploads_playlist_id, fetched_at = excluded.fetched_at`,
    );
    await this.db.batch(
      rows.map((c) =>
        stmt.bind(c.id, c.title, c.handle, c.thumbnailUrl, c.subscriberCount, c.uploadsPlaylistId, c.fetchedAt, c.videosRefreshedAt, c.lastRequestedAt),
      ),
    );
  }
  async getChannels(ids: string[]) {
    const out: ChannelRow[] = [];
    for (const part of chunk([...new Set(ids)], MAX_PARAMS)) {
      out.push(...(await this.all(`SELECT * FROM channels WHERE id IN (${placeholders(part.length)})`, ...part)).map(toChannel));
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  async markChannelsRequested(ids: string[], at: string) {
    for (const part of chunk([...new Set(ids)], MAX_PARAMS)) {
      await this.run(`UPDATE channels SET last_requested_at = ? WHERE id IN (${placeholders(part.length)})`, at, ...part);
    }
  }
  async markChannelRefreshed(id: string, at: string) {
    await this.run('UPDATE channels SET videos_refreshed_at = ? WHERE id = ?', at, id);
  }
  async listChannelsNeedingRefresh(requestedSince: string, staleBefore: string, limit: number) {
    const rows = await this.all(
      `SELECT id FROM channels WHERE last_requested_at >= ? AND (videos_refreshed_at IS NULL OR videos_refreshed_at < ?)
       ORDER BY videos_refreshed_at IS NOT NULL, videos_refreshed_at LIMIT ?`,
      requestedSince, staleBefore, limit,
    );
    return rows.map((r) => String(r.id));
  }

  async upsertVideos(rows: VideoMeta[], fetchedAt: string) {
    if (rows.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO videos (id, channel_id, published_at, data, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET channel_id = excluded.channel_id, published_at = excluded.published_at, data = excluded.data, fetched_at = excluded.fetched_at`,
    );
    for (const part of chunk(rows, 50)) {
      await this.db.batch(part.map((v) => stmt.bind(v.id, v.channelId, v.publishedAt, JSON.stringify(v), fetchedAt)));
    }
  }
  async getVideos(ids: string[]) {
    const byId = new Map<string, VideoMeta>();
    for (const part of chunk([...new Set(ids)], MAX_PARAMS)) {
      for (const r of await this.all(`SELECT data FROM videos WHERE id IN (${placeholders(part.length)})`, ...part)) {
        const v = toVideo(r);
        byId.set(v.id, v);
      }
    }
    return ids.map((id) => byId.get(id)).filter((v): v is VideoMeta => !!v);
  }
  async getRecentVideosForChannels(channelIds: string[], perChannel: number) {
    const out: VideoMeta[] = [];
    for (const part of chunk([...new Set(channelIds)], MAX_PARAMS)) {
      const rows = await this.all(
        `SELECT data FROM (
           SELECT data, ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY published_at DESC) AS rn
           FROM videos WHERE channel_id IN (${placeholders(part.length)})
         ) WHERE rn <= ?`,
        ...part,
        perChannel,
      );
      out.push(...rows.map(toVideo));
    }
    return out;
  }
  async markVideoUnplayable(id: string) {
    await this.run(`UPDATE videos SET data = json_set(data, '$.embeddable', json('false')) WHERE id = ?`, id);
  }

  async getCache(key: string) {
    const r = await this.first('SELECT value, fetched_at FROM kv_cache WHERE key = ?', key);
    return r ? { value: String(r.value), fetchedAt: String(r.fetched_at) } : null;
  }
  async putCache(key: string, value: string, fetchedAt: string) {
    await this.run(
      'INSERT INTO kv_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at',
      key, value, fetchedAt,
    );
  }

  async incrementCounter(key: string, by: number) {
    const r = await this.first(
      'INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value RETURNING value',
      key, by,
    );
    return Number(r?.value ?? by);
  }
  async getCounter(key: string) {
    const r = await this.first('SELECT value FROM counters WHERE key = ?', key);
    return Number(r?.value ?? 0);
  }
}
