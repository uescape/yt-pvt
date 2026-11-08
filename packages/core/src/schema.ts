import { z } from 'zod';

/** YouTube channel IDs always look like UC + 22 url-safe base64 chars. */
export const channelIdSchema = z.string().regex(/^UC[\w-]{22}$/, 'Invalid YouTube channel id');

/** YouTube video IDs are 11 url-safe base64 chars. */
export const videoIdSchema = z.string().regex(/^[\w-]{11}$/, 'Invalid YouTube video id');

export const profileKindSchema = z.enum(['kids', 'standard']);
export type ProfileKind = z.infer<typeof profileKindSchema>;

/**
 * `allowlist`: the profile only ever shows videos from `channels` (the safest mode, ideal for kids).
 * `open`: shows followed `channels` plus trending videos from `trendingCategoryIds`, minus everything blocked.
 */
export const feedModeSchema = z.enum(['allowlist', 'open']);
export type FeedMode = z.infer<typeof feedModeSchema>;

const keyword = z.string().trim().min(1).max(60);

export const filterRulesSchema = z.object({
  mode: feedModeSchema,
  /** Source channels. In allowlist mode these are the ONLY channels shown. */
  channels: z.array(channelIdSchema).max(200),
  blockedChannels: z.array(channelIdSchema).max(1000),
  /** Matched against title, description, tags and channel name. Supports phrases and a trailing `*` wildcard. */
  blockedKeywords: z.array(keyword).max(300),
  hideShorts: z.boolean(),
  hideLive: z.boolean(),
  /** Only show videos the uploader marked as "made for kids" (fail-closed: unknown = hidden). */
  madeForKidsOnly: z.boolean(),
  minDurationSec: z.number().int().min(0).max(36_000).nullable(),
  maxDurationSec: z.number().int().min(30).max(36_000).nullable(),
  /** YouTube category ids (see CATEGORIES) that are never shown. */
  blockedCategoryIds: z.array(z.string().regex(/^\d{1,3}$/)).max(50),
  /** Open mode only: which trending categories to mix in. Use "0" for the overall trending chart. */
  trendingCategoryIds: z.array(z.string().regex(/^\d{1,3}$/)).max(10),
});
export type FilterRules = z.infer<typeof filterRulesSchema>;

export const playerSettingsSchema = z.object({
  /** Use youtube-nocookie.com (privacy-enhanced embeds). */
  privacyEnhanced: z.boolean(),
  /** Automatically play the next video from the filtered feed when one ends. */
  autoplayNext: z.boolean(),
  /** SponsorBlock: show a "Skip sponsor" button the viewer presses. Never skips automatically. */
  sponsorSkip: z.enum(['off', 'button']),
});
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;

export const avatarSchema = z.object({
  emoji: z.string().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Avatar = z.infer<typeof avatarSchema>;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(30),
  kind: profileKindSchema,
  avatar: avatarSchema,
  /** Require the household PIN on the TV before entering this profile (keeps kids out of adult profiles). */
  pinToEnter: z.boolean(),
  rules: filterRulesSchema,
  player: playerSettingsSchema,
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface Profile extends ProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type LiveStatus = 'none' | 'live' | 'upcoming';

/** Normalized video metadata, as cached by the backend from the YouTube Data API. */
export interface VideoMeta {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  /** Truncated description (first ~500 chars) – enough for keyword filtering. */
  description: string;
  tags: string[];
  categoryId: string | null;
  durationSec: number | null;
  publishedAt: string;
  madeForKids: boolean | null;
  liveStatus: LiveStatus;
  embeddable: boolean;
  /** width / height of the embed, from `player.embedWidth/embedHeight`. < 1 means vertical. */
  aspectRatio: number | null;
  thumbnailUrl: string;
  /** ISO 3166-1 alpha-2 codes, from contentDetails.regionRestriction. */
  regionAllowed: string[] | null;
  regionBlocked: string[] | null;
}

export interface ChannelMeta {
  id: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string;
  subscriberCount: number | null;
  uploadsPlaylistId: string;
}

/** The slim shape sent to TVs. */
export interface VideoCard {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSec: number | null;
  publishedAt: string;
}

export interface FeedRow {
  id: string;
  title: string;
  videos: VideoCard[];
}

export function toVideoCard(v: VideoMeta): VideoCard {
  return {
    id: v.id,
    title: v.title,
    channelId: v.channelId,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    publishedAt: v.publishedAt,
  };
}
