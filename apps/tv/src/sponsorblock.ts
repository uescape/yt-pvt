/**
 * SponsorBlock (https://sponsor.ajay.app) is a community database of creator-read sponsor segments.
 * These are NOT YouTube ads. We only ever show a "Skip sponsor" button the viewer presses;
 * nothing is skipped automatically.
 */
export interface Segment {
  start: number;
  end: number;
}

const cache = new Map<string, Segment[]>();

export async function fetchSponsorSegments(videoId: string): Promise<Segment[]> {
  const hit = cache.get(videoId);
  if (hit) return hit;
  try {
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent('["sponsor","selfpromo"]')}`;
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(videoId, []);
      return [];
    }
    const data = (await res.json()) as Array<{ segment: [number, number] }>;
    const segments = data.map((d) => ({ start: d.segment[0], end: d.segment[1] })).filter((s) => s.end - s.start >= 3);
    cache.set(videoId, segments);
    return segments;
  } catch {
    return [];
  }
}

export function activeSegment(segments: Segment[], t: number): Segment | null {
  for (const s of segments) if (t >= s.start && t < s.end - 1) return s;
  return null;
}
