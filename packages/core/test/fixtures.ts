import type { VideoMeta } from '../src';

export const CH_A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
export const CH_B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
export const CH_C = 'UCcccccccccccccccccccccc';

let n = 0;
export function video(overrides: Partial<VideoMeta> = {}): VideoMeta {
  n += 1;
  return {
    id: `vid${String(n).padStart(8, '0')}`,
    channelId: CH_A,
    channelTitle: 'Channel A',
    title: `Video ${n}`,
    description: '',
    tags: [],
    categoryId: '27',
    durationSec: 600,
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
    madeForKids: true,
    liveStatus: 'none',
    embeddable: true,
    aspectRatio: 16 / 9,
    thumbnailUrl: 'https://i.ytimg.com/vi/x/mqdefault.jpg',
    regionAllowed: null,
    regionBlocked: null,
    ...overrides,
  };
}
