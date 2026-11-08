import type { ProfileInput, ProfileKind } from './schema';

/**
 * Kids: allowlist-only, made-for-kids content, no Shorts, no live streams, max 20 minute videos,
 * privacy-enhanced player and no autoplay (videos end, instead of rolling into the next one).
 */
export function kidsPreset(name = 'Kids'): ProfileInput {
  return {
    name,
    kind: 'kids',
    avatar: { emoji: '🧸', color: '#F59E0B' },
    pinToEnter: false,
    rules: {
      mode: 'allowlist',
      channels: [],
      blockedChannels: [],
      blockedKeywords: [],
      hideShorts: true,
      hideLive: true,
      madeForKidsOnly: true,
      minDurationSec: null,
      maxDurationSec: 20 * 60,
      blockedCategoryIds: [],
      trendingCategoryIds: [],
    },
    player: { privacyEnhanced: true, autoplayNext: false, sponsorSkip: 'off' },
  };
}

/** Standard: your channels plus trending, minus blocked channels/keywords, Shorts hidden. */
export function standardPreset(name = 'Me'): ProfileInput {
  return {
    name,
    kind: 'standard',
    avatar: { emoji: '🎬', color: '#6366F1' },
    pinToEnter: true,
    rules: {
      mode: 'open',
      channels: [],
      blockedChannels: [],
      blockedKeywords: [],
      hideShorts: true,
      hideLive: false,
      madeForKidsOnly: false,
      minDurationSec: null,
      maxDurationSec: null,
      blockedCategoryIds: [],
      trendingCategoryIds: ['28', '27'],
    },
    player: { privacyEnhanced: false, autoplayNext: true, sponsorSkip: 'button' },
  };
}

export function presetFor(kind: ProfileKind, name?: string): ProfileInput {
  return kind === 'kids' ? kidsPreset(name) : standardPreset(name);
}
