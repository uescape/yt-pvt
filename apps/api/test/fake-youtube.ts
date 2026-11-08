/** A tiny fake of the YouTube Data API v3 endpoints the backend uses. Records every call for quota assertions. */

export interface FakeVideo {
  id: string;
  channelId: string;
  title: string;
  duration?: string;
  madeForKids?: boolean;
  embeddable?: boolean;
  live?: 'none' | 'live' | 'upcoming';
  vertical?: boolean;
  categoryId?: string;
  tags?: string[];
  publishedAt?: string;
}

export interface FakeChannel {
  id: string;
  title: string;
  handle: string;
}

export class FakeYouTube {
  channels: FakeChannel[] = [];
  videos: FakeVideo[] = [];
  trending: Record<string, string[]> = {};
  calls: string[] = [];
  failWith: { status: number; reason: string } | null = null;

  addChannel(id: string, title: string, handle: string) {
    this.channels.push({ id, title, handle });
  }

  addVideo(v: FakeVideo) {
    this.videos.push(v);
  }

  private channelJson(c: FakeChannel) {
    return {
      id: c.id,
      snippet: { title: c.title, customUrl: c.handle, thumbnails: { medium: { url: `https://yt3/${c.id}.jpg` } } },
      statistics: { subscriberCount: '1000' },
      contentDetails: { relatedPlaylists: { uploads: `UU${c.id.slice(2)}` } },
    };
  }

  private videoJson(v: FakeVideo) {
    const ch = this.channels.find((c) => c.id === v.channelId);
    return {
      id: v.id,
      snippet: {
        channelId: v.channelId,
        channelTitle: ch?.title ?? 'Unknown',
        title: v.title,
        description: '',
        tags: v.tags ?? [],
        categoryId: v.categoryId ?? '27',
        publishedAt: v.publishedAt ?? '2026-01-01T00:00:00Z',
        liveBroadcastContent: v.live ?? 'none',
      },
      contentDetails: { duration: v.duration ?? 'PT10M' },
      status: { embeddable: v.embeddable ?? true, madeForKids: v.madeForKids ?? true, privacyStatus: 'public' },
      player: v.vertical ? { embedWidth: 405, embedHeight: 720 } : { embedWidth: 1280, embedHeight: 720 },
    };
  }

  fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split('/').pop()!;
    const p = url.searchParams;
    this.calls.push(endpoint);
    if (this.failWith) {
      return Response.json({ error: { message: 'fail', errors: [{ reason: this.failWith.reason }] } }, { status: this.failWith.status });
    }

    if (endpoint === 'channels') {
      let items = this.channels;
      if (p.get('id')) {
        const ids = p.get('id')!.split(',');
        items = items.filter((c) => ids.includes(c.id));
      } else if (p.get('forHandle')) {
        const h = p.get('forHandle')!.toLowerCase();
        items = items.filter((c) => c.handle.toLowerCase() === h);
      } else items = [];
      return Response.json({ items: items.map((c) => this.channelJson(c)) });
    }
    if (endpoint === 'playlistItems') {
      const channelId = `UC${p.get('playlistId')!.slice(2)}`;
      if (!this.channels.some((c) => c.id === channelId)) return Response.json({ error: { errors: [{ reason: 'playlistNotFound' }] } }, { status: 404 });
      const items = this.videos
        .filter((v) => v.channelId === channelId)
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
        .slice(0, 50)
        .map((v) => ({ contentDetails: { videoId: v.id } }));
      return Response.json({ items });
    }
    if (endpoint === 'videos') {
      if (p.get('chart') === 'mostPopular') {
        const ids = this.trending[`${p.get('regionCode')}:${p.get('videoCategoryId') ?? '0'}`];
        if (!ids) return Response.json({ error: { errors: [{ reason: 'videoChartNotFound' }] } }, { status: 400 });
        return Response.json({ items: ids.map((id) => this.videoJson(this.videos.find((v) => v.id === id)!)) });
      }
      const ids = (p.get('id') ?? '').split(',');
      return Response.json({ items: this.videos.filter((v) => ids.includes(v.id)).map((v) => this.videoJson(v)) });
    }
    if (endpoint === 'search') {
      const q = (p.get('q') ?? '').toLowerCase();
      const items = this.channels.filter((c) => c.title.toLowerCase().includes(q)).map((c) => ({ id: { channelId: c.id } }));
      return Response.json({ items });
    }
    return new Response('not found', { status: 404 });
  };
}
