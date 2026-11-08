export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !isFinite(totalSec) || totalSec <= 0) return '0:00';
  const t = Math.floor(totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = s < 10 ? `0${s}` : String(s);
  if (h > 0) return `${h}:${m < 10 ? `0${m}` : m}:${ss}`;
  return `${m}:${ss}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 60) return min <= 1 ? 'just now' : `${min} minutes ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  const w = Math.floor(d / 7);
  if (d < 31) return w === 1 ? '1 week ago' : `${w} weeks ago`;
  const mo = Math.floor(d / 30);
  if (d < 365) return mo <= 1 ? '1 month ago' : `${mo} months ago`;
  const y = Math.floor(d / 365);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}

export function clock(date = new Date()): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h}:${m < 10 ? `0${m}` : m}`;
}
