import { describe, expect, it } from 'vitest';
import {
  compileKeywordMatcher,
  createVideoFilter,
  filterRulesSchema,
  filterVideos,
  formatDuration,
  isLikelyShort,
  kidsPreset,
  parseChannelInput,
  parseIsoDuration,
  profileInputSchema,
  rankByRecency,
  standardPreset,
  type FilterRules,
} from '../src';
import { CH_A, CH_B, CH_C, video } from './fixtures';

const rules = (overrides: Partial<FilterRules> = {}): FilterRules => ({
  ...kidsPreset().rules,
  channels: [CH_A, CH_B],
  ...overrides,
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT45S', 45],
    ['PT1M', 60],
    ['PT1H2M3S', 3723],
    ['P1DT1S', 86401],
    ['PT10.5S', 10],
    ['P0D', null],
    ['nonsense', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected);
  });

  it('formats', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('');
  });
});

describe('keyword matcher', () => {
  const m = compileKeywordMatcher(['war', 'try not to laugh', 'prank*', '#asmr', 'Café'])!;

  it('matches whole words only', () => {
    expect(m('The war begins')).toBe('war');
    expect(m('Award show')).toBeNull();
    expect(m('WAR!')).toBe('war');
  });

  it('matches phrases across extra whitespace and case', () => {
    expect(m('TRY   not to Laugh challenge')).toBe('try not to laugh');
  });

  it('supports prefix wildcard', () => {
    expect(m('Best pranks of 2026')).toBe('prank*');
    expect(m('Pranked my dad')).toBe('prank*');
    expect(m('sprank')).toBeNull();
  });

  it('matches hashtags and ignores diacritics', () => {
    expect(m('relaxing #ASMR')).toBe('#asmr');
    expect(m('cafe vlog')).toBe('cafe');
  });

  it('works with non-latin scripts', () => {
    const urdu = compileKeywordMatcher(['ڈرامہ'])!;
    expect(urdu('نیا ڈرامہ قسط 1')).toBe('ڈرامہ');
  });

  it('returns null for empty lists', () => {
    expect(compileKeywordMatcher([' ', ''])).toBeNull();
  });
});

describe('isLikelyShort', () => {
  it('uses aspect ratio when known', () => {
    expect(isLikelyShort(video({ durationSec: 170, aspectRatio: 9 / 16 }))).toBe(true);
    expect(isLikelyShort(video({ durationSec: 50, aspectRatio: 16 / 9 }))).toBe(false);
  });
  it('never flags videos over 3 minutes', () => {
    expect(isLikelyShort(video({ durationSec: 181, aspectRatio: 9 / 16 }))).toBe(false);
  });
  it('falls back to duration and #shorts', () => {
    expect(isLikelyShort(video({ durationSec: 59, aspectRatio: null }))).toBe(true);
    expect(isLikelyShort(video({ durationSec: 120, aspectRatio: null, title: 'wow #shorts' }))).toBe(true);
    expect(isLikelyShort(video({ durationSec: 120, aspectRatio: null }))).toBe(false);
  });
});

describe('createVideoFilter', () => {
  it('allowlist mode only allows listed channels', () => {
    const f = createVideoFilter(rules());
    expect(f(video({ channelId: CH_A })).allowed).toBe(true);
    expect(f(video({ channelId: CH_C }))).toEqual({ allowed: false, reason: 'channel-not-allowed' });
  });

  it('allowlist mode ignores allowAnyChannel', () => {
    const f = createVideoFilter(rules(), { allowAnyChannel: true });
    expect(f(video({ channelId: CH_C })).allowed).toBe(false);
  });

  it('open mode allows any non-blocked channel for discovery sources', () => {
    const f = createVideoFilter(rules({ mode: 'open', blockedChannels: [CH_B], madeForKidsOnly: false }), {
      allowAnyChannel: true,
    });
    expect(f(video({ channelId: CH_C })).allowed).toBe(true);
    expect(f(video({ channelId: CH_B }))).toEqual({ allowed: false, reason: 'channel-blocked' });
  });

  it('blocks are stronger than allows', () => {
    const f = createVideoFilter(rules({ blockedChannels: [CH_A] }));
    expect(f(video({ channelId: CH_A }))).toEqual({ allowed: false, reason: 'channel-blocked' });
  });

  it('made-for-kids fails closed on unknown', () => {
    const f = createVideoFilter(rules());
    expect(f(video({ madeForKids: null })).allowed).toBe(false);
    expect(f(video({ madeForKids: false })).allowed).toBe(false);
  });

  it('hides live, shorts, durations, categories, keywords', () => {
    const f = createVideoFilter(
      rules({ minDurationSec: 120, maxDurationSec: 900, blockedCategoryIds: ['20'], blockedKeywords: ['slime'] }),
    );
    expect(f(video({ liveStatus: 'live' }))).toMatchObject({ reason: 'live' });
    expect(f(video({ durationSec: 40, aspectRatio: 0.56 }))).toMatchObject({ reason: 'short' });
    expect(f(video({ durationSec: 100 }))).toMatchObject({ reason: 'too-short' });
    expect(f(video({ durationSec: 1000 }))).toMatchObject({ reason: 'too-long' });
    expect(f(video({ durationSec: null }))).toMatchObject({ reason: 'too-long' });
    expect(f(video({ categoryId: '20' }))).toMatchObject({ reason: 'category' });
    expect(f(video({ tags: ['DIY', 'Slime'] }))).toMatchObject({ reason: 'keyword', detail: 'slime' });
    expect(f(video({ description: 'today we make slime' }))).toMatchObject({ reason: 'keyword' });
  });

  it('respects embeddability and region restrictions', () => {
    const f = createVideoFilter(rules(), { region: 'pk' });
    expect(f(video({ embeddable: false }))).toMatchObject({ reason: 'not-embeddable' });
    expect(f(video({ regionAllowed: ['US'] }))).toMatchObject({ reason: 'region' });
    expect(f(video({ regionBlocked: ['PK'] }))).toMatchObject({ reason: 'region' });
    expect(f(video({ regionAllowed: ['PK', 'US'] })).allowed).toBe(true);
  });

  it('filterVideos counts exclusions', () => {
    const res = filterVideos([video(), video({ channelId: CH_C }), video({ liveStatus: 'upcoming' })], rules());
    expect(res.allowed).toHaveLength(1);
    expect(res.excluded).toEqual({ 'channel-not-allowed': 1, live: 1 });
  });
});

describe('rankByRecency', () => {
  it('sorts newest first and limits same-channel runs', () => {
    const a1 = video({ channelId: CH_A, publishedAt: '2026-01-10T00:00:00Z' });
    const a2 = video({ channelId: CH_A, publishedAt: '2026-01-09T00:00:00Z' });
    const a3 = video({ channelId: CH_A, publishedAt: '2026-01-08T00:00:00Z' });
    const b1 = video({ channelId: CH_B, publishedAt: '2026-01-01T00:00:00Z' });
    const ranked = rankByRecency([b1, a3, a1, a2, a1], 2);
    expect(ranked.map((v) => v.id)).toEqual([a1.id, a2.id, b1.id, a3.id]);
  });
});

describe('parseChannelInput', () => {
  it.each([
    ['UCaaaaaaaaaaaaaaaaaaaaaa', { kind: 'id', value: 'UCaaaaaaaaaaaaaaaaaaaaaa' }],
    ['@SciShowKids', { kind: 'handle', value: '@SciShowKids' }],
    ['https://www.youtube.com/@SciShowKids/videos', { kind: 'handle', value: '@SciShowKids' }],
    ['youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa', { kind: 'id', value: 'UCaaaaaaaaaaaaaaaaaaaaaa' }],
    ['https://m.youtube.com/user/oldname', { kind: 'username', value: 'oldname' }],
    ['https://youtu.be/dQw4w9WgXcQ?t=3', { kind: 'video', value: 'dQw4w9WgXcQ' }],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x', { kind: 'video', value: 'dQw4w9WgXcQ' }],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', { kind: 'video', value: 'dQw4w9WgXcQ' }],
    ['science for kids', { kind: 'query', value: 'science for kids' }],
  ])('%s', (input, expected) => {
    expect(parseChannelInput(input)).toEqual(expected);
  });
});

describe('schemas and presets', () => {
  it('presets are valid', () => {
    expect(profileInputSchema.parse(kidsPreset())).toBeTruthy();
    expect(profileInputSchema.parse(standardPreset())).toBeTruthy();
  });
  it('rejects bad channel ids', () => {
    expect(filterRulesSchema.safeParse({ ...kidsPreset().rules, channels: ['nope'] }).success).toBe(false);
  });
});
