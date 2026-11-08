/* Platform adapters: Samsung Tizen, LG webOS, Hisense/Toshiba VIDAA, Android TV / Google TV / Fire TV (via our WebView shell), desktop browser. */

export type PlatformId = 'tizen' | 'webos' | 'vidaa' | 'androidtv' | 'firetv' | 'browser';

interface TizenApi {
  application?: { getCurrentApplication(): { exit(): void } };
  tvinputdevice?: { registerKeyBatch?(keys: string[]): void; registerKey?(key: string): void };
}

interface NativeBridge {
  exit(): void;
  platform(): string;
  deviceName?(): string;
}

declare global {
  interface Window {
    tizen?: TizenApi;
    webOS?: { platformBack?(): void };
    PalmSystem?: unknown;
    /** Injected by platforms/android-tv (addJavascriptInterface). */
    CuratoNative?: NativeBridge;
    /** Called by the Android shell when the remote's Back button is pressed. */
    __curatoBack?: () => void;
  }
}

function queryPlatform(): string | null {
  const m = /[?&]platform=([a-z]+)/.exec(window.location.search);
  return m ? m[1]! : null;
}

export function detectPlatform(): PlatformId {
  const q = queryPlatform();
  if (q === 'tizen' || q === 'webos' || q === 'vidaa' || q === 'androidtv' || q === 'firetv' || q === 'browser') return q;
  if (window.CuratoNative) {
    const p = window.CuratoNative.platform();
    return p === 'firetv' ? 'firetv' : 'androidtv';
  }
  if (window.tizen || /Tizen/i.test(navigator.userAgent)) return 'tizen';
  // VIDAA (Hisense, some Toshiba) runs hosted HTML5 apps in its Chromium-based browser engine.
  if (/VIDAA|Hisense/i.test(navigator.userAgent)) return 'vidaa';
  if (window.webOS || window.PalmSystem || /Web0S|webOS/i.test(navigator.userAgent)) return 'webos';
  return 'browser';
}

export const platform: PlatformId = detectPlatform();

export const isTv = platform !== 'browser';

export function platformLabel(p: PlatformId = platform): string {
  return { tizen: 'Samsung TV', webos: 'LG TV', vidaa: 'Hisense TV', androidtv: 'Android TV', firetv: 'Fire TV', browser: 'Web browser' }[p];
}

export function deviceName(): string {
  try {
    const native = window.CuratoNative?.deviceName?.();
    if (native) return native;
  } catch {
    /* ignore */
  }
  return platformLabel();
}

/** Tizen only delivers media keys after registering them. Arrows, Enter and Back always work. */
export function registerMediaKeys(): void {
  const keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ColorF0Red'];
  try {
    const input = window.tizen?.tvinputdevice;
    if (input?.registerKeyBatch) input.registerKeyBatch(keys);
    else if (input?.registerKey) keys.forEach((k) => input.registerKey!(k));
  } catch {
    /* hosted pages may not have device API access; media keys are optional */
  }
}

export function exitApp(): void {
  try {
    if (window.CuratoNative) return window.CuratoNative.exit();
    if (window.tizen?.application) return window.tizen.application.getCurrentApplication().exit();
    if (platform === 'webos' && window.webOS?.platformBack) return window.webOS.platformBack();
  } catch {
    /* fall through */
  }
  if (isTv) window.close();
}
