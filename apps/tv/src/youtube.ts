/* Loader and types for the official YouTube IFrame Player API. We never modify the player or its ads. */

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  loadVideoById(id: string): void;
  destroy(): void;
  getIframe?(): HTMLIFrameElement;
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the YouTube player'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const PLAYER_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/** IFrame API error codes: 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 embedding disabled. */
export function describePlayerError(code: number): { message: string; unplayable: boolean } {
  switch (code) {
    case 100:
      return { message: 'This video was removed or made private.', unplayable: true };
    case 101:
    case 150:
    case 152:
      return { message: 'The owner doesn’t allow this video to play in other apps.', unplayable: true };
    case 2:
      return { message: 'This video can’t be played.', unplayable: true };
    default:
      return { message: 'The video couldn’t be played right now.', unplayable: false };
  }
}

export function playerVars(origin: string | null): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    autoplay: 1,
    // We draw our own remote-friendly controls on top of the IFrame API (controls=0 is an official option).
    controls: 0,
    // Related videos at the end come from the same channel only; we show our filtered "Up next" instead.
    rel: 0,
    iv_load_policy: 3,
    playsinline: 1,
    fs: 0,
    disablekb: 1,
    enablejsapi: 1,
  };
  if (origin && /^https?:/.test(origin)) vars.origin = origin;
  return vars;
}
