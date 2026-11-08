import { normalizeText, parseChannelInput, type ChannelMeta, type VideoMeta } from '@curato/core';
import { badRequest, notFound, tooMany } from '../lib/errors';
import type { ChannelRow, Store } from '../store/types';
import { YouTubeApiError, type YouTubeClient } from '../youtube/client';
import type { QuotaPriority } from '../youtube/quota';

const HOUR = 3_600_000;
export const CHANNEL_STALE_MS = 3 * HOUR;
const CHANNEL_META_STALE_MS = 7 * 24 * HOUR;
const TRENDING_TTL_MS = 3 * HOUR;
const TRENDING_ERROR_TTL_MS = 24 * HOUR;
const SEARCH_TTL_MS = 7 * 24 * HOUR;
/** Max channels refreshed synchronously while a TV waits for its home screen. */
const MAX_SYNC_REFRESH = 6;

export interface CatalogDeps {
  store: Store;
  youtube: YouTubeClient;
  now: () => Date;
  searchesPerHouseholdPerDay: number;
}

const toRow = (c: ChannelMeta, at: string): ChannelRow => ({ ...c, fetchedAt: at, videosRefreshedAt: null, lastRequestedAt: null });

/**
 * Owns the shared YouTube cache. Every quota-spending decision lives here:
 * channels are fetched once and shared by all households, uploads are refreshed at most every 3h,
 * trending charts are cached per region/category, and searches are cached for a week.
 */
export class Catalog {
  constructor(private readonly d: CatalogDeps) {}

  private iso(offsetMs = 0) {
    return new Date(this.d.now().getTime() + offsetMs).toISOString();
  }

  /** Resolves pasted text (handle, URL, id, video link) to a channel, caching it. */
  async resolveChannel(input: string, householdId: string, region: string): Promise<ChannelMeta> {
    const lookup = parseChannelInput(input);
    let channelId: string | null = null;
    let fresh: ChannelMeta | null = null;

    switch (lookup.kind) {
      case 'id':
        channelId = lookup.value;
        break;
      case 'handle':
        fresh = await this.d.youtube.channelByHandle(lookup.value);
        break;
      case 'username':
        fresh = await this.d.youtube.channelByUsername(lookup.value);
        break;
      case 'video': {
        const [v] = await this.d.youtube.videosByIds([lookup.value], 'interactive');
        if (v) {
          await this.d.store.upsertVideos([v], this.iso());
          channelId = v.channelId;
        }
        break;
      }
      case 'query': {
        const [first] = await this.searchChannels(lookup.value, householdId, region);
        if (!first) throw notFound('Channel');
        return first;
      }
    }

    if (fresh) {
      await this.d.store.upsertChannels([toRow(fresh, this.iso())]);
      await this.refreshChannelVideos(fresh.id, 'interactive');
      return fresh;
    }
    if (!channelId) throw notFound('Channel');
    const [channel] = await this.getChannels([channelId]);
    if (!channel) throw notFound('Channel');
    return channel;
  }

  /** Channel search (100 units). Cached per normalized query for a week, rate-limited per household. */
  async searchChannels(query: string, householdId: string, region: string): Promise<ChannelMeta[]> {
    const q = normalizeText(query).slice(0, 80);
    if (q.length < 2) throw badRequest('Search query is too short');
    const key = `search:${region}:${q}`;
    const cached = await this.d.store.getCache(key);
    let ids: string[];
    if (cached && Date.parse(cached.fetchedAt) > this.d.now().getTime() - SEARCH_TTL_MS) {
      ids = JSON.parse(cached.value) as string[];
    } else {
      const counterKey = `searches:${householdId}:${this.iso().slice(0, 10)}`;
      const count = await this.d.store.incrementCounter(counterKey, 1);
      if (count > this.d.searchesPerHouseholdPerDay) {
        throw tooMany('Daily search limit reached. Paste a channel link or @handle instead – those are always available.');
      }
      ids = await this.d.youtube.searchChannelIds(q, region);
      await this.d.store.putCache(key, JSON.stringify(ids), this.iso());
    }
    return this.getChannels(ids);
  }

  /** Channel metadata from cache, fetching unknown or week-old entries in one batched call. */
  async getChannels(ids: string[], priority: QuotaPriority = 'interactive'): Promise<ChannelMeta[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const cached = await this.d.store.getChannels(unique);
    const staleBefore = this.d.now().getTime() - CHANNEL_META_STALE_MS;
    const known = new Map(cached.map((c) => [c.id, c]));
    const missing = unique.filter((id) => {
      const c = known.get(id);
      return !c || Date.parse(c.fetchedAt) < staleBefore;
    });
    if (missing.length > 0) {
      const fetched = await this.d.youtube.channelsByIds(missing, priority);
      await this.d.store.upsertChannels(fetched.map((c) => toRow(c, this.iso())));
      for (const c of fetched) known.set(c.id, { ...toRow(c, this.iso()), ...known.get(c.id), ...c });
    }
    return unique.map((id) => known.get(id)).filter((c): c is ChannelRow => !!c).map(stripRow);
  }

  /** Re-reads a channel's newest 50 uploads: 1 unit (playlist) + 1 unit (video details). */
  async refreshChannelVideos(channelId: string, priority: QuotaPriority): Promise<void> {
    let [channel] = await this.d.store.getChannels([channelId]);
    if (!channel) {
      await this.getChannels([channelId], priority);
      [channel] = await this.d.store.getChannels([channelId]);
      if (!channel) return;
    }
    const ids = await this.d.youtube.latestUploadIds(channel.uploadsPlaylistId, priority);
    if (ids.length > 0) {
      const videos = await this.d.youtube.videosByIds(ids, priority);
      await this.d.store.upsertVideos(videos, this.iso());
    }
    await this.d.store.markChannelRefreshed(channelId, this.iso());
  }

  /**
   * Makes sure the TV has something to show. Channels never fetched before are loaded right away
   * (bounded); merely stale channels are left to the cron job so TVs stay fast.
   */
  async ensureFresh(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) return;
    await this.getChannels(channelIds);
    await this.d.store.markChannelsRequested(channelIds, this.iso());
    const rows = await this.d.store.getChannels(channelIds);
    const never = rows.filter((r) => !r.videosRefreshedAt).slice(0, MAX_SYNC_REFRESH);
    await Promise.all(never.map((r) => this.refreshChannelVideos(r.id, 'interactive').catch(() => undefined)));
  }

  async getTrending(region: string, categoryId: string, priority: QuotaPriority = 'interactive'): Promise<VideoMeta[]> {
    const key = `trending:${region}:${categoryId}`;
    const cached = await this.d.store.getCache(key);
    const now = this.d.now().getTime();
    if (cached) {
      const parsed = JSON.parse(cached.value) as { ids: string[]; error?: boolean };
      const ttl = parsed.error ? TRENDING_ERROR_TTL_MS : TRENDING_TTL_MS;
      if (Date.parse(cached.fetchedAt) > now - ttl) return this.d.store.getVideos(parsed.ids);
    }
    try {
      const videos = await this.d.youtube.mostPopular(region, categoryId, priority);
      await this.d.store.upsertVideos(videos, this.iso());
      await this.d.store.putCache(key, JSON.stringify({ ids: videos.map((v) => v.id) }), this.iso());
      return videos;
    } catch (e) {
      // Some categories have no chart in some regions (400). Remember that for a day.
      if (e instanceof YouTubeApiError && (e.httpStatus === 400 || e.httpStatus === 404)) {
        await this.d.store.putCache(key, JSON.stringify({ ids: [], error: true }), this.iso());
        return [];
      }
      if (cached) return this.d.store.getVideos((JSON.parse(cached.value) as { ids: string[] }).ids);
      throw e;
    }
  }

  /** Cron: refresh channels that TVs actually use, oldest first, within the background budget. */
  async refreshStaleChannels(maxChannels: number): Promise<number> {
    const requestedSince = this.iso(-7 * 24 * HOUR);
    const staleBefore = this.iso(-CHANNEL_STALE_MS);
    const ids = await this.d.store.listChannelsNeedingRefresh(requestedSince, staleBefore, maxChannels);
    let done = 0;
    for (const id of ids) {
      try {
        await this.refreshChannelVideos(id, 'background');
        done += 1;
      } catch (e) {
        if (e instanceof Error && (e as { code?: string }).code === 'quota_exhausted') break;
      }
    }
    return done;
  }
}

function stripRow(c: ChannelRow): ChannelMeta {
  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    thumbnailUrl: c.thumbnailUrl,
    subscriberCount: c.subscriberCount,
    uploadsPlaylistId: c.uploadsPlaylistId,
  };
}
