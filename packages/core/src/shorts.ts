import type { VideoMeta } from './schema';

/** YouTube Shorts can be up to 3 minutes long (since October 2024). */
export const SHORTS_MAX_SEC = 180;

/**
 * The Data API has no "isShort" flag, so we combine signals:
 * 1. Shorts are vertical: `player.embedWidth / embedHeight` < 1 (most reliable signal).
 * 2. Duration <= 3 minutes.
 * 3. Fallback when aspect ratio is unknown: very short (<= 60s) or tagged #shorts.
 */
export function isLikelyShort(v: Pick<VideoMeta, 'durationSec' | 'aspectRatio' | 'title' | 'description' | 'tags'>): boolean {
  if (v.durationSec == null || v.durationSec > SHORTS_MAX_SEC) return false;
  if (v.aspectRatio != null) return v.aspectRatio < 1;
  if (v.durationSec <= 60) return true;
  const hay = `${v.title} ${v.description} ${v.tags.join(' ')}`.toLowerCase();
  return hay.includes('#shorts') || hay.includes('#short ');
}
