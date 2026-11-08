import type { Avatar, ChannelMeta, FeedRow, PlayerSettings, Profile, ProfileKind } from './schema';
import type { ExclusionReason } from './filter';

/** Shapes shared by the API, the TV app and the phone app. */

export interface CreateHouseholdResponse {
  householdId: string;
  token: string;
}

export interface TvDevice {
  id: string;
  name: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface HouseholdResponse {
  id: string;
  region: string;
  hasPin: boolean;
  devices: TvDevice[];
}

export interface PairStartResponse {
  pairingId: string;
  code: string;
  pollToken: string;
  expiresAt: string;
}

export type PairStatusResponse =
  | { status: 'pending'; expiresAt: string }
  | { status: 'expired' }
  | { status: 'paired'; deviceToken: string };

export interface TvProfileSummary {
  id: string;
  name: string;
  kind: ProfileKind;
  avatar: Avatar;
  pinToEnter: boolean;
}

export interface TvSessionResponse {
  deviceId: string;
  hasPin: boolean;
  profiles: TvProfileSummary[];
}

export interface HomeResponse {
  profile: TvProfileSummary;
  player: PlayerSettings;
  rows: FeedRow[];
  generatedAt: string;
}

export interface PreviewResponse extends HomeResponse {
  totalCandidates: number;
  excluded: Partial<Record<ExclusionReason, number>>;
}

export interface ProfilesResponse {
  profiles: Profile[];
}

export interface ChannelsResponse {
  channels: ChannelMeta[];
}

export interface ApiError {
  error: string;
  message: string;
}
