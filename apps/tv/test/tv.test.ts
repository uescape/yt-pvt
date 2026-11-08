import { describe, expect, it } from 'vitest';
import { formatDuration, timeAgo } from '../src/format';
import { toKey } from '../src/input';
import { describePlayerError } from '../src/youtube';

const ev = (init: KeyboardEventInit & { keyCode?: number }) => {
  const e = new KeyboardEvent('keydown', init);
  if (init.keyCode !== undefined) Object.defineProperty(e, 'keyCode', { value: init.keyCode });
  return e;
};

describe('remote key mapping', () => {
  it('maps standard keys', () => {
    expect(toKey(ev({ key: 'ArrowUp' }))).toBe('up');
    expect(toKey(ev({ key: 'Enter' }))).toBe('enter');
    expect(toKey(ev({ key: 'MediaPlayPause' }))).toBe('playpause');
  });
  it('maps platform back keys', () => {
    expect(toKey(ev({ key: 'Unidentified', keyCode: 10009 }))).toBe('back'); // Samsung
    expect(toKey(ev({ key: 'Unidentified', keyCode: 461 }))).toBe('back'); // LG
    expect(toKey(ev({ key: 'GoBack' }))).toBe('back');
    expect(toKey(ev({ key: 'Unidentified', keyCode: 8 }))).toBe('back'); // Hisense VIDAA
  });
  it('maps media keys by keyCode', () => {
    expect(toKey(ev({ key: 'Unidentified', keyCode: 417 }))).toBe('ff');
    expect(toKey(ev({ key: 'Unidentified', keyCode: 412 }))).toBe('rw');
    expect(toKey(ev({ key: 'Unidentified', keyCode: 10252 }))).toBe('playpause');
  });
  it('ignores other keys', () => {
    expect(toKey(ev({ key: 'a', keyCode: 65 }))).toBeNull();
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(605)).toBe('10:05');
    expect(formatDuration(3605)).toBe('1:00:05');
    expect(formatDuration(NaN)).toBe('0:00');
  });
  it('formats relative times', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(timeAgo('2026-11-08T11:30:00Z', now)).toBe('30 minutes ago');
    expect(timeAgo('2026-11-07T12:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-10-25T12:00:00Z', now)).toBe('2 weeks ago');
  });
});

describe('player errors', () => {
  it('flags videos that can never play so the server can hide them', () => {
    expect(describePlayerError(150).unplayable).toBe(true);
    expect(describePlayerError(100).unplayable).toBe(true);
    expect(describePlayerError(5).unplayable).toBe(false);
  });
});
