/* Minimal polyfills for 2018-era TV browsers (Chromium 53–56). Syntax is transpiled by Vite; these cover APIs. */

if (!String.prototype.padStart) {
  String.prototype.padStart = function padStart(this: string, len: number, fill = ' ') {
    let s = String(this);
    while (s.length < len) s = fill + s;
    return s.slice(s.length - Math.max(len, String(this).length));
  };
}

if (!Object.entries) {
  Object.entries = (o: Record<string, unknown>) => Object.keys(o).map((k) => [k, o[k]] as [string, unknown]);
}

if (!Object.values) {
  Object.values = (o: Record<string, unknown>) => Object.keys(o).map((k) => o[k]);
}

export {};
