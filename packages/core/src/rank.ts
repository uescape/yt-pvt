import type { VideoMeta } from './schema';

/** Removes duplicate video ids, keeping the first occurrence. */
export function dedupeVideos<T extends { id: string }>(videos: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of videos) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/**
 * Newest-first, but never more than `maxRun` consecutive videos from the same channel,
 * so one prolific uploader can't flood the "Latest" row.
 */
export function rankByRecency(videos: readonly VideoMeta[], maxRun = 2): VideoMeta[] {
  const pending = dedupeVideos(videos).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const out: VideoMeta[] = [];
  while (pending.length > 0) {
    let pick = 0;
    const tail = out.slice(-maxRun);
    if (tail.length === maxRun && tail.every((v) => v.channelId === tail[0]!.channelId)) {
      const idx = pending.findIndex((v) => v.channelId !== tail[0]!.channelId);
      if (idx !== -1) pick = idx;
    }
    out.push(pending.splice(pick, 1)[0]!);
  }
  return out;
}
