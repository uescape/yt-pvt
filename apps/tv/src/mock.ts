import type { FeedRow, HomeResponse, TvProfileSummary, VideoCard } from '@curato/core';
import type { TvApi } from './api';

/* Demo data for `?mock=1`: lets you run and design the TV UI without a backend or API key. */

const palette = ['#2563EB', '#16A34A', '#DB2777', '#F59E0B', '#7C3AED', '#0891B2', '#DC2626', '#4D7C0F'];

function thumb(i: number, label: string): string {
  const a = palette[i % palette.length]!;
  const b = palette[(i + 3) % palette.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="260" cy="40" r="60" fill="rgba(255,255,255,.12)"/><text x="20" y="160" font-family="sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,.9)">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const channels = [
  { id: 'UCmockmockmockmockmock01', title: 'Little Explorers', topics: ['Dinosaurs', 'Volcanoes', 'Planets', 'Oceans', 'Bugs', 'Rainforest'] },
  { id: 'UCmockmockmockmockmock02', title: 'Paint & Play', topics: ['Watercolor', 'Clay animals', 'Origami', 'Chalk art', 'Collage'] },
  { id: 'UCmockmockmockmockmock03', title: 'Number Garden', topics: ['Counting', 'Shapes', 'Patterns', 'Telling time', 'Fractions'] },
  { id: 'UCmockmockmockmockmock04', title: 'Story Tree', topics: ['The brave fox', 'Moon picnic', 'Lost kite', 'Snow day'] },
];

// The real IFrame player needs real video ids; these are public-domain/test-friendly placeholders.
const PLAYABLE_IDS = ['aqz-KE-bpKQ', 'M7lc1UVf-VE', 'ScMzIvxBSi4', 'jNQXAC9IVRw'];

let n = 0;
const videosByChannel = channels.map((c, ci) =>
  c.topics.map((topic, ti): VideoCard => {
    n += 1;
    return {
      id: PLAYABLE_IDS[n % PLAYABLE_IDS.length]!,
      title: `${topic}: ${['for curious kids', 'step by step', 'explained', 'story time', 'fun facts'][(ci + ti) % 5]}`,
      channelId: c.id,
      channelTitle: c.title,
      thumbnailUrl: thumb(n, topic),
      durationSec: 180 + ((n * 97) % 900),
      publishedAt: new Date(Date.UTC(2026, 10, 7) - n * 26 * 3_600_000).toISOString(),
    };
  }),
);

const profiles: TvProfileSummary[] = [
  { id: 'kids-1', name: 'Ali', kind: 'kids', avatar: { emoji: '🦖', color: '#16A34A' }, pinToEnter: false },
  { id: 'kids-2', name: 'Sara', kind: 'kids', avatar: { emoji: '🦄', color: '#DB2777' }, pinToEnter: false },
  { id: 'adult-1', name: 'Parents', kind: 'standard', avatar: { emoji: '🎬', color: '#6366F1' }, pinToEnter: true },
];

function rows(): FeedRow[] {
  const latest = videosByChannel
    .flat()
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 12);
  return [
    { id: 'latest', title: 'Latest', videos: latest },
    ...channels.map((c, i) => ({ id: `channel-${c.id}`, title: c.title, videos: videosByChannel[i]! })),
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pairPolls = 0;

export const mockApi: TvApi = {
  async startPairing() {
    pairPolls = 0;
    return { pairingId: 'mock', code: '482913', pollToken: 'mock', expiresAt: new Date(Date.now() + 600_000).toISOString() };
  },
  async pairingStatus() {
    pairPolls += 1;
    await sleep(200);
    return pairPolls > 2 ? { status: 'paired', deviceToken: 'mock-token' } : { status: 'pending', expiresAt: new Date(Date.now() + 600_000).toISOString() };
  },
  async session() {
    await sleep(150);
    return { deviceId: 'mock-device', hasPin: true, profiles };
  },
  async home(profileId): Promise<HomeResponse> {
    await sleep(250);
    const profile = profiles.find((p) => p.id === profileId) ?? profiles[0]!;
    return {
      profile,
      player: { privacyEnhanced: profile.kind === 'kids', autoplayNext: profile.kind !== 'kids', sponsorSkip: profile.kind === 'kids' ? 'off' : 'button' },
      rows: rows(),
      generatedAt: new Date().toISOString(),
    };
  },
  async verifyPin(pin) {
    await sleep(150);
    return pin === '1234';
  },
  async reportUnplayable() {},
  async unpair() {},
};
