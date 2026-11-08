import { parseIsoDuration, type ChannelMeta, type LiveStatus, type VideoMeta } from '@curato/core';
import { HttpError } from '../lib/errors';
import { QuotaExceededError, type QuotaGuard, type QuotaPriority } from './quota';

const BASE = 'https://www.googleapis.com/youtube/v3';

/** Quota cost per call (https://developers.google.com/youtube/v3/determine_quota_cost). */
export const COST = { list: 1, search: 100 } as const;

export class YouTubeApiError extends HttpError {
  constructor(
    readonly httpStatus: number,
    readonly reason: string,
    message: string,
  ) {
    super(httpStatus === 404 ? 404 : 502, `youtube_${reason}`, message);
  }
}

/* ---- Raw response shapes (only the fields we use) ---- */
interface Thumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}
interface RawChannel {
  id: string;
  snippet?: { title: string; customUrl?: string; thumbnails?: Thumbs };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}
interface RawVideo {
  id: string;
  snippet?: {
    channelId: string;
    channelTitle: string;
    title: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    publishedAt: string;
    liveBroadcastContent?: string;
    thumbnails?: Thumbs;
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
    contentRating?: { ytRating?: string };
  };
  status?: { embeddable?: boolean; madeForKids?: boolean; privacyStatus?: string; uploadStatus?: string };
  player?: { embedWidth?: string | number; embedHeight?: string | number };
}
interface ListResponse<T> {
  items?: T[];
  nextPageToken?: string;
}

export function mapChannel(raw: RawChannel): ChannelMeta | null {
  if (!raw.snippet) return null;
  const t = raw.snippet.thumbnails;
  const handle = raw.snippet.customUrl ?? null;
  return {
    id: raw.id,
    title: raw.snippet.title,
    handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : null,
    thumbnailUrl: t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? '',
    subscriberCount:
      raw.statistics?.hiddenSubscriberCount || raw.statistics?.subscriberCount == null ? null : Number(raw.statistics.subscriberCount),
    uploadsPlaylistId: raw.contentDetails?.relatedPlaylists?.uploads ?? `UU${raw.id.slice(2)}`,
  };
}

export function mapVideo(raw: RawVideo): VideoMeta | null {
  const s = raw.snippet;
  if (!s) return null;
  const st = raw.status ?? {};
  const live = s.liveBroadcastContent;
  const liveStatus: LiveStatus = live === 'live' ? 'live' : live === 'upcoming' ? 'upcoming' : 'none';
  const w = Number(raw.player?.embedWidth);
  const h = Number(raw.player?.embedHeight);
  const ageRestricted = raw.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted';
  const publicish = st.privacyStatus == null || st.privacyStatus === 'public' || st.privacyStatus === 'unlisted';
  return {
    id: raw.id,
    channelId: s.channelId,
    channelTitle: s.channelTitle,
    title: s.title,
    description: (s.description ?? '').slice(0, 500),
    tags: (s.tags ?? []).slice(0, 30),
    categoryId: s.categoryId ?? null,
    durationSec: parseIsoDuration(raw.contentDetails?.duration),
    publishedAt: s.publishedAt,
    madeForKids: typeof st.madeForKids === 'boolean' ? st.madeForKids : null,
    liveStatus,
    // Age-restricted and private videos never play in embeds.
    embeddable: st.embeddable !== false && !ageRestricted && publicish,
    aspectRatio: w > 0 && h > 0 ? Math.round((w / h) * 1000) / 1000 : null,
    thumbnailUrl: `https://i.ytimg.com/vi/${raw.id}/mqdefault.jpg`,
    regionAllowed: raw.contentDetails?.regionRestriction?.allowed ?? null,
    regionBlocked: raw.contentDetails?.regionRestriction?.blocked ?? null,
  };
}

const VIDEO_PARTS = 'snippet,contentDetails,status,player';
const CHANNEL_PARTS = 'snippet,contentDetails,statistics';

export interface YouTubeClientOptions {
  apiKey: string;
  quota: QuotaGuard;
  fetch?: typeof fetch;
}

/** Thin, quota-aware YouTube Data API v3 client. Every call is charged to the QuotaGuard first. */
export class YouTubeClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: YouTubeClientOptions) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>, cost: number, priority: QuotaPriority): Promise<T> {
    if (!this.opts.apiKey) throw new HttpError(503, 'not_configured', 'YOUTUBE_API_KEY is not configured');
    await this.opts.quota.spend(cost, priority);
    const url = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    url.searchParams.set('key', this.opts.apiKey);

    const res = await this.fetchImpl(url.toString(), { headers: { accept: 'application/json' } });
    if (res.ok) return (await res.json()) as T;

    let reason = 'error';
    let message = `YouTube API ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
      reason = body.error?.errors?.[0]?.reason ?? reason;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      await this.opts.quota.exhaust();
      throw new QuotaExceededError();
    }
    throw new YouTubeApiError(res.status, reason, message);
  }

  async channelsByIds(ids: string[], priority: QuotaPriority = 'interactive'): Promise<ChannelMeta[]> {
    const out: ChannelMeta[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = await this.get<ListResponse<RawChannel>>('channels', { part: CHANNEL_PARTS, id: ids.slice(i, i + 50).join(','), maxResults: 50 }, COST.list, priority);
      out.push(...(res.items ?? []).map(mapChannel).filter((c): c is ChannelMeta => !!c));
    }
    return out;
  }

  async channelByHandle(handle: string): Promise<ChannelMeta | null> {
    const res = await this.get<ListResponse<RawChannel>>('channels', { part: CHANNEL_PARTS, forHandle: handle }, COST.list, 'interactive');
    const first = res.items?.[0];
    return first ? mapChannel(first) : null;
  }

  async channelByUsername(username: string): Promise<ChannelMeta | null> {
    const res = await this.get<ListResponse<RawChannel>>('channels', { part: CHANNEL_PARTS, forUsername: username }, COST.list, 'interactive');
    const first = res.items?.[0];
    return first ? mapChannel(first) : null;
  }

  /** Expensive (100 units). Callers must cache and rate-limit. Returns channel ids in relevance order. */
  async searchChannelIds(query: string, regionCode?: string): Promise<string[]> {
    const res = await this.get<ListResponse<{ id?: { channelId?: string } }>>(
      'search',
      { part: 'id', type: 'channel', q: query, maxResults: 10, regionCode, safeSearch: 'moderate' },
      COST.search,
      'interactive',
    );
    return (res.items ?? []).map((i) => i.id?.channelId).filter((id): id is string => !!id);
  }

  /** Newest uploads of a channel via its uploads playlist (1 unit). Returns video ids. */
  async latestUploadIds(uploadsPlaylistId: string, priority: QuotaPriority): Promise<string[]> {
    try {
      const res = await this.get<ListResponse<{ contentDetails?: { videoId?: string } }>>(
        'playlistItems',
        { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50 },
        COST.list,
        priority,
      );
      return (res.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => !!id);
    } catch (e) {
      // Channels without public uploads have no (public) uploads playlist.
      if (e instanceof YouTubeApiError && e.httpStatus === 404) return [];
      throw e;
    }
  }

  async videosByIds(ids: string[], priority: QuotaPriority): Promise<VideoMeta[]> {
    const out: VideoMeta[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = await this.get<ListResponse<RawVideo>>(
        'videos',
        // maxHeight makes the API return embedWidth/embedHeight, our vertical-video (Shorts) signal.
        { part: VIDEO_PARTS, id: ids.slice(i, i + 50).join(','), maxResults: 50, maxHeight: 720 },
        COST.list,
        priority,
      );
      out.push(...(res.items ?? []).map(mapVideo).filter((v): v is VideoMeta => !!v));
    }
    return out;
  }

  /** Trending chart for a region, optionally per category ("0" = overall). */
  async mostPopular(regionCode: string, categoryId: string, priority: QuotaPriority): Promise<VideoMeta[]> {
    const res = await this.get<ListResponse<RawVideo>>(
      'videos',
      {
        part: VIDEO_PARTS,
        chart: 'mostPopular',
        regionCode,
        videoCategoryId: categoryId === '0' ? undefined : categoryId,
        maxResults: 50,
        maxHeight: 720,
      },
      COST.list,
      priority,
    );
    return (res.items ?? []).map(mapVideo).filter((v): v is VideoMeta => !!v);
  }
}
