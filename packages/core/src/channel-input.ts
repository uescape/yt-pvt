export type ChannelLookup =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'username'; value: string }
  | { kind: 'video'; value: string }
  | { kind: 'query'; value: string };

/**
 * Turns whatever a parent pastes into a lookup the backend can resolve cheaply:
 * - `UC…` ids and `/channel/UC…` urls      -> channels.list?id=        (1 quota unit)
 * - `@handle` and `/@handle` urls           -> channels.list?forHandle= (1 unit)
 * - `/user/name` legacy urls                -> channels.list?forUsername= (1 unit)
 * - video urls (watch, youtu.be, shorts)    -> videos.list -> channel   (1 unit)
 * - anything else                           -> search.list              (100 units, cached)
 */
export function parseChannelInput(raw: string): ChannelLookup {
  const input = raw.trim();
  if (/^UC[\w-]{22}$/.test(input)) return { kind: 'id', value: input };
  if (/^@[\w.\-·]{3,30}$/u.test(input)) return { kind: 'handle', value: input };

  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    url = null;
  }
  const host = url?.hostname.replace(/^(www\.|m\.|music\.)/, '') ?? '';
  if (url && (host === 'youtube.com' || host === 'youtu.be')) {
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (host === 'youtu.be' && parts[0]) return { kind: 'video', value: parts[0].slice(0, 11) };
    const [first, second] = parts;
    if (first?.startsWith('@')) return { kind: 'handle', value: first };
    if (first === 'channel' && second && /^UC[\w-]{22}$/.test(second)) return { kind: 'id', value: second };
    if (first === 'user' && second) return { kind: 'username', value: second };
    if ((first === 'shorts' || first === 'live' || first === 'embed') && second) return { kind: 'video', value: second.slice(0, 11) };
    const v = url.searchParams.get('v');
    if (first === 'watch' && v) return { kind: 'video', value: v.slice(0, 11) };
    if (first === 'c' && second) return { kind: 'query', value: second };
  }
  return { kind: 'query', value: input };
}
