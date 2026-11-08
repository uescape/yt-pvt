import type { FilterRules, VideoMeta } from './schema';
import { isLikelyShort } from './shorts';
import { compileKeywordMatcher } from './text';

export type ExclusionReason =
  | 'not-embeddable'
  | 'region'
  | 'channel-blocked'
  | 'channel-not-allowed'
  | 'not-made-for-kids'
  | 'live'
  | 'short'
  | 'too-short'
  | 'too-long'
  | 'category'
  | 'keyword';

export type FilterDecision = { allowed: true } | { allowed: false; reason: ExclusionReason; detail?: string };

export interface FilterContext {
  /** Viewer region (ISO 3166-1 alpha-2) for region-restriction checks. */
  region?: string;
  /**
   * Channels the video may come from in addition to `rules.channels` (e.g. trending in open mode).
   * Ignored in allowlist mode.
   */
  allowAnyChannel?: boolean;
}

const ALLOWED: FilterDecision = { allowed: true };

/**
 * Builds a reusable predicate for a rule set. Compile once per request, then run over many videos.
 * Rules are checked cheapest-first; the first failing rule is reported (used for the parent preview stats).
 */
export function createVideoFilter(rules: FilterRules, ctx: FilterContext = {}): (v: VideoMeta) => FilterDecision {
  const allowedChannels = new Set(rules.channels);
  const blockedChannels = new Set(rules.blockedChannels);
  const blockedCategories = new Set(rules.blockedCategoryIds);
  const matchKeyword = compileKeywordMatcher(rules.blockedKeywords);
  const region = ctx.region?.toUpperCase();
  const strictChannels = rules.mode === 'allowlist' || !ctx.allowAnyChannel;

  return (v) => {
    if (!v.embeddable) return { allowed: false, reason: 'not-embeddable' };
    if (region) {
      if (v.regionAllowed && !v.regionAllowed.includes(region)) return { allowed: false, reason: 'region' };
      if (v.regionBlocked && v.regionBlocked.includes(region)) return { allowed: false, reason: 'region' };
    }
    if (blockedChannels.has(v.channelId)) return { allowed: false, reason: 'channel-blocked' };
    if (strictChannels && !allowedChannels.has(v.channelId)) return { allowed: false, reason: 'channel-not-allowed' };
    if (rules.madeForKidsOnly && v.madeForKids !== true) return { allowed: false, reason: 'not-made-for-kids' };
    if (rules.hideLive && v.liveStatus !== 'none') return { allowed: false, reason: 'live' };
    if (rules.hideShorts && isLikelyShort(v)) return { allowed: false, reason: 'short' };
    if (rules.minDurationSec != null && v.durationSec != null && v.durationSec < rules.minDurationSec) {
      return { allowed: false, reason: 'too-short' };
    }
    if (rules.maxDurationSec != null) {
      // Unknown duration (e.g. live/upcoming) cannot prove it fits the limit: fail closed.
      if (v.durationSec == null || v.durationSec > rules.maxDurationSec) return { allowed: false, reason: 'too-long' };
    }
    if (v.categoryId && blockedCategories.has(v.categoryId)) return { allowed: false, reason: 'category' };
    if (matchKeyword) {
      const hit =
        matchKeyword(v.title) ?? matchKeyword(v.channelTitle) ?? matchKeyword(v.tags.join(' , ')) ?? matchKeyword(v.description);
      if (hit) return { allowed: false, reason: 'keyword', detail: hit };
    }
    return ALLOWED;
  };
}

export interface FilterResult {
  allowed: VideoMeta[];
  excluded: Partial<Record<ExclusionReason, number>>;
}

export function filterVideos(videos: readonly VideoMeta[], rules: FilterRules, ctx: FilterContext = {}): FilterResult {
  const check = createVideoFilter(rules, ctx);
  const allowed: VideoMeta[] = [];
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  for (const v of videos) {
    const d = check(v);
    if (d.allowed) allowed.push(v);
    else excluded[d.reason] = (excluded[d.reason] ?? 0) + 1;
  }
  return { allowed, excluded };
}
