import type { ProfileInput, VideoMeta } from '@curato/core';
import type { ChannelRow, HouseholdRow, PairingRow, ProfileRow, Store, TokenKind, TokenRow } from './types';

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Store for tests and local experiments. Mirrors D1Store semantics. */
export class MemoryStore implements Store {
  households = new Map<string, HouseholdRow>();
  tokens = new Map<string, TokenRow>();
  pairings = new Map<string, PairingRow>();
  profiles = new Map<string, ProfileRow>();
  channels = new Map<string, ChannelRow>();
  videos = new Map<string, VideoMeta>();
  cache = new Map<string, { value: string; fetchedAt: string }>();
  counters = new Map<string, number>();

  async createHousehold(row: HouseholdRow) {
    this.households.set(row.id, clone(row));
  }
  async getHousehold(id: string) {
    const h = this.households.get(id);
    return h ? clone(h) : null;
  }
  async updateHousehold(id: string, patch: Partial<Pick<HouseholdRow, 'region' | 'pinHash' | 'pinSalt'>>) {
    const h = this.households.get(id);
    if (h) this.households.set(id, { ...h, ...patch });
  }

  async insertToken(row: TokenRow) {
    this.tokens.set(row.id, clone(row));
  }
  async getTokenByHash(hash: string) {
    for (const t of this.tokens.values()) if (t.tokenHash === hash) return clone(t);
    return null;
  }
  async touchToken(id: string, at: string) {
    const t = this.tokens.get(id);
    if (t) t.lastSeenAt = at;
  }
  async listTokens(householdId: string, kind: TokenKind) {
    return [...this.tokens.values()]
      .filter((t) => t.householdId === householdId && t.kind === kind)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
  async deleteToken(householdId: string, id: string) {
    const t = this.tokens.get(id);
    if (!t || t.householdId !== householdId) return false;
    return this.tokens.delete(id);
  }

  async insertPairing(row: PairingRow) {
    this.pairings.set(row.id, clone(row));
  }
  async getPairing(id: string) {
    const p = this.pairings.get(id);
    return p ? clone(p) : null;
  }
  async findActivePairingByCode(code: string, now: string) {
    for (const p of this.pairings.values()) {
      if (p.code === code && !p.consumed && !p.householdId && p.expiresAt > now) return clone(p);
    }
    return null;
  }
  async updatePairing(id: string, patch: Partial<Pick<PairingRow, 'householdId' | 'deviceName'>>) {
    const p = this.pairings.get(id);
    if (p) this.pairings.set(id, { ...p, ...patch });
  }
  async consumePairing(id: string) {
    const p = this.pairings.get(id);
    if (!p || p.consumed) return false;
    p.consumed = true;
    return true;
  }

  async listProfiles(householdId: string) {
    return [...this.profiles.values()]
      .filter((p) => p.householdId === householdId)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
  async getProfile(householdId: string, id: string) {
    const p = this.profiles.get(id);
    return p && p.householdId === householdId ? clone(p) : null;
  }
  async insertProfile(row: ProfileRow) {
    this.profiles.set(row.id, clone(row));
  }
  async updateProfile(householdId: string, id: string, data: ProfileInput, updatedAt: string) {
    const p = this.profiles.get(id);
    if (!p || p.householdId !== householdId) return false;
    this.profiles.set(id, { ...p, data: clone(data), updatedAt });
    return true;
  }
  async deleteProfile(householdId: string, id: string) {
    const p = this.profiles.get(id);
    if (!p || p.householdId !== householdId) return false;
    return this.profiles.delete(id);
  }

  async upsertChannels(rows: ChannelRow[]) {
    for (const r of rows) {
      const prev = this.channels.get(r.id);
      this.channels.set(r.id, {
        ...clone(r),
        videosRefreshedAt: prev?.videosRefreshedAt ?? r.videosRefreshedAt,
        lastRequestedAt: prev?.lastRequestedAt ?? r.lastRequestedAt,
      });
    }
  }
  async getChannels(ids: string[]) {
    return ids.map((id) => this.channels.get(id)).filter((c): c is ChannelRow => !!c).map(clone);
  }
  async markChannelsRequested(ids: string[], at: string) {
    for (const id of ids) {
      const c = this.channels.get(id);
      if (c) c.lastRequestedAt = at;
    }
  }
  async markChannelRefreshed(id: string, at: string) {
    const c = this.channels.get(id);
    if (c) c.videosRefreshedAt = at;
  }
  async listChannelsNeedingRefresh(requestedSince: string, staleBefore: string, limit: number) {
    return [...this.channels.values()]
      .filter((c) => (c.lastRequestedAt ?? '') >= requestedSince && (c.videosRefreshedAt ?? '') < staleBefore)
      .sort((a, b) => (a.videosRefreshedAt ?? '').localeCompare(b.videosRefreshedAt ?? ''))
      .slice(0, limit)
      .map((c) => c.id);
  }

  async upsertVideos(rows: VideoMeta[]) {
    for (const v of rows) this.videos.set(v.id, clone(v));
  }
  async getVideos(ids: string[]) {
    return ids.map((id) => this.videos.get(id)).filter((v): v is VideoMeta => !!v).map(clone);
  }
  async getRecentVideosForChannels(channelIds: string[], perChannel: number) {
    const wanted = new Set(channelIds);
    const byChannel = new Map<string, VideoMeta[]>();
    for (const v of this.videos.values()) {
      if (!wanted.has(v.channelId)) continue;
      const list = byChannel.get(v.channelId) ?? [];
      list.push(v);
      byChannel.set(v.channelId, list);
    }
    return [...byChannel.values()].flatMap((list) =>
      list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, perChannel).map(clone),
    );
  }
  async markVideoUnplayable(id: string) {
    const v = this.videos.get(id);
    if (v) v.embeddable = false;
  }

  async getCache(key: string) {
    return this.cache.get(key) ?? null;
  }
  async putCache(key: string, value: string, fetchedAt: string) {
    this.cache.set(key, { value, fetchedAt });
  }

  async incrementCounter(key: string, by: number) {
    const next = (this.counters.get(key) ?? 0) + by;
    this.counters.set(key, next);
    return next;
  }
  async getCounter(key: string) {
    return this.counters.get(key) ?? 0;
  }
}
