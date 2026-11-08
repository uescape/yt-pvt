import type { ChannelMeta, ProfileInput, VideoMeta } from '@curato/core';

export interface HouseholdRow {
  id: string;
  region: string;
  pinHash: string | null;
  pinSalt: string | null;
  createdAt: string;
}

export type TokenKind = 'manager' | 'tv';

export interface TokenRow {
  id: string;
  tokenHash: string;
  householdId: string;
  kind: TokenKind;
  name: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PairingRow {
  id: string;
  code: string;
  pollTokenHash: string;
  platform: string;
  expiresAt: string;
  householdId: string | null;
  deviceName: string | null;
  consumed: boolean;
}

export interface ProfileRow {
  id: string;
  householdId: string;
  position: number;
  data: ProfileInput;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelRow extends ChannelMeta {
  fetchedAt: string;
  videosRefreshedAt: string | null;
  lastRequestedAt: string | null;
}

/**
 * Persistence boundary. `D1Store` is used in production; `MemoryStore` in tests and local experiments.
 * Keep it narrow: services hold the logic, the store only reads and writes rows.
 */
export interface Store {
  createHousehold(row: HouseholdRow): Promise<void>;
  getHousehold(id: string): Promise<HouseholdRow | null>;
  updateHousehold(id: string, patch: Partial<Pick<HouseholdRow, 'region' | 'pinHash' | 'pinSalt'>>): Promise<void>;

  insertToken(row: TokenRow): Promise<void>;
  getTokenByHash(hash: string): Promise<TokenRow | null>;
  touchToken(id: string, at: string): Promise<void>;
  listTokens(householdId: string, kind: TokenKind): Promise<TokenRow[]>;
  deleteToken(householdId: string, id: string): Promise<boolean>;

  insertPairing(row: PairingRow): Promise<void>;
  getPairing(id: string): Promise<PairingRow | null>;
  findActivePairingByCode(code: string, now: string): Promise<PairingRow | null>;
  updatePairing(id: string, patch: Partial<Pick<PairingRow, 'householdId' | 'deviceName'>>): Promise<void>;
  /** Marks a claimed pairing consumed. Returns false if it was already consumed (prevents issuing two tokens). */
  consumePairing(id: string): Promise<boolean>;

  listProfiles(householdId: string): Promise<ProfileRow[]>;
  getProfile(householdId: string, id: string): Promise<ProfileRow | null>;
  insertProfile(row: ProfileRow): Promise<void>;
  updateProfile(householdId: string, id: string, data: ProfileInput, updatedAt: string): Promise<boolean>;
  deleteProfile(householdId: string, id: string): Promise<boolean>;

  upsertChannels(rows: ChannelRow[]): Promise<void>;
  getChannels(ids: string[]): Promise<ChannelRow[]>;
  markChannelsRequested(ids: string[], at: string): Promise<void>;
  markChannelRefreshed(id: string, at: string): Promise<void>;
  /** Channels someone looked at since `requestedSince`, not refreshed since `staleBefore`, oldest first. */
  listChannelsNeedingRefresh(requestedSince: string, staleBefore: string, limit: number): Promise<string[]>;

  upsertVideos(rows: VideoMeta[], fetchedAt: string): Promise<void>;
  getVideos(ids: string[]): Promise<VideoMeta[]>;
  /** The newest `perChannel` videos of each channel. */
  getRecentVideosForChannels(channelIds: string[], perChannel: number): Promise<VideoMeta[]>;
  markVideoUnplayable(id: string): Promise<void>;

  getCache(key: string): Promise<{ value: string; fetchedAt: string } | null>;
  putCache(key: string, value: string, fetchedAt: string): Promise<void>;

  /** Atomically adds `by` and returns the new value. */
  incrementCounter(key: string, by: number): Promise<number>;
  getCounter(key: string): Promise<number>;
}
