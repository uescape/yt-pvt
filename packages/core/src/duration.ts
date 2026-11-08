/**
 * Parses YouTube's ISO-8601 durations (e.g. `PT1H2M3S`, `P1DT2H`, `PT45S`) into seconds.
 * Returns null for unparseable or "P0D" (used for upcoming live streams).
 */
export function parseIsoDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(input);
  if (!m) return null;
  const [, w, d, h, min, s] = m;
  const total =
    Number(w ?? 0) * 604_800 +
    Number(d ?? 0) * 86_400 +
    Number(h ?? 0) * 3_600 +
    Number(min ?? 0) * 60 +
    Math.floor(Number(s ?? 0));
  return total > 0 ? total : null;
}

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || totalSec <= 0) return '';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
