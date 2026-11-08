import {
  categoryName,
  createVideoFilter,
  rankByRecency,
  toVideoCard,
  type ExclusionReason,
  type FeedRow,
  type ProfileInput,
  type VideoMeta,
} from '@curato/core';
import type { Store } from '../store/types';
import type { Catalog } from './catalog';

const LATEST_SIZE = 40;
const TRENDING_ROW_SIZE = 30;
const CHANNEL_ROW_SIZE = 25;
const MAX_CHANNEL_ROWS = 30;
const VIDEOS_PER_CHANNEL = 50;

export interface BuiltHome {
  rows: FeedRow[];
  totalCandidates: number;
  excluded: Partial<Record<ExclusionReason, number>>;
}

/**
 * Builds a profile's TV home screen. Filtering runs server-side so the TV only ever receives
 * videos that passed every rule – nothing blocked is sent to the device at all.
 */
export async function buildHome(deps: { store: Store; catalog: Catalog }, profile: ProfileInput, region: string): Promise<BuiltHome> {
  const { rules } = profile;
  const blocked = new Set(rules.blockedChannels);
  const channelIds = rules.channels.filter((id) => !blocked.has(id));

  await deps.catalog.ensureFresh(channelIds);
  const [channelVideos, channels] = await Promise.all([
    deps.store.getRecentVideosForChannels(channelIds, VIDEOS_PER_CHANNEL),
    deps.store.getChannels(channelIds),
  ]);

  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const count = (videos: VideoMeta[], check: ReturnType<typeof createVideoFilter>) =>
    videos.filter((v) => {
      const d = check(v);
      if (!d.allowed) excluded[d.reason] = (excluded[d.reason] ?? 0) + 1;
      return d.allowed;
    });

  const allowedOwn = count(channelVideos, createVideoFilter(rules, { region }));
  const rows: FeedRow[] = [];
  let totalCandidates = channelVideos.length;

  if (allowedOwn.length > 0) {
    rows.push({ id: 'latest', title: 'Latest', videos: rankByRecency(allowedOwn).slice(0, LATEST_SIZE).map(toVideoCard) });
  }

  if (rules.mode === 'open') {
    const discover = createVideoFilter(rules, { region, allowAnyChannel: true });
    for (const categoryId of rules.trendingCategoryIds) {
      const trending = await deps.catalog.getTrending(region, categoryId).catch(() => [] as VideoMeta[]);
      totalCandidates += trending.length;
      const allowed = count(trending, discover);
      if (allowed.length > 0) {
        rows.push({
          id: `trending-${categoryId}`,
          title: categoryId === '0' ? 'Trending' : `Trending in ${categoryName(categoryId)}`,
          videos: allowed.slice(0, TRENDING_ROW_SIZE).map(toVideoCard),
        });
      }
    }
  }

  // One row per channel, channels with the freshest upload first.
  const byChannel = new Map<string, VideoMeta[]>();
  for (const v of allowedOwn) {
    const list = byChannel.get(v.channelId) ?? [];
    list.push(v);
    byChannel.set(v.channelId, list);
  }
  const titles = new Map(channels.map((c) => [c.id, c.title]));
  const channelRows = [...byChannel.entries()]
    .map(([id, list]) => ({ id, list: list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) }))
    .sort((a, b) => b.list[0]!.publishedAt.localeCompare(a.list[0]!.publishedAt))
    .slice(0, MAX_CHANNEL_ROWS);
  for (const { id, list } of channelRows) {
    rows.push({
      id: `channel-${id}`,
      title: titles.get(id) ?? list[0]!.channelTitle,
      videos: list.slice(0, CHANNEL_ROW_SIZE).map(toVideoCard),
    });
  }

  return { rows, totalCandidates, excluded };
}
