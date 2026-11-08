/**
 * Spatial navigation for D-pad remotes.
 *
 * - Focusable elements carry `data-focusable`.
 * - The topmost `data-focus-scope` (modals) traps focus.
 * - Elements inside a `data-focus-group` remember the last focused child, so moving back
 *   into a row restores where you were (like every big streaming app).
 * - Horizontal rows (`data-row`) and the vertical page (`data-vscroll`) scroll to keep focus visible.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

const lastInGroup = new Map<string, HTMLElement>();

function activeScope(): ParentNode {
  const scopes = document.querySelectorAll<HTMLElement>('[data-focus-scope]');
  return scopes.length > 0 ? scopes[scopes.length - 1]! : document;
}

function focusables(scope: ParentNode): HTMLElement[] {
  return Array.prototype.slice
    .call(scope.querySelectorAll('[data-focusable]'))
    .filter((el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
}

function groupOf(el: Element): string | null {
  const g = el.closest('[data-focus-group]');
  return g ? g.getAttribute('data-focus-group') : null;
}

export function focusElement(el: HTMLElement | null | undefined): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  const group = groupOf(el);
  if (group) lastInGroup.set(group, el);
  scrollIntoView(el);
}

function scrollIntoView(el: HTMLElement): void {
  const row = el.closest<HTMLElement>('[data-row]');
  if (row) {
    const pad = row.clientWidth * 0.06;
    const left = el.offsetLeft - row.offsetLeft;
    if (left - pad < row.scrollLeft) row.scrollLeft = Math.max(0, left - pad);
    else if (left + el.offsetWidth + pad > row.scrollLeft + row.clientWidth) row.scrollLeft = left + el.offsetWidth + pad - row.clientWidth;
  }
  const page = el.closest<HTMLElement>('[data-vscroll]');
  if (page) {
    // Pin the focused row near the top (layout position = rect offset + current scroll, valid mid-animation).
    const anchor = el.closest<HTMLElement>('[data-scroll-anchor]') ?? el;
    const top = anchor.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
    const target = Math.max(0, Math.round(top - page.clientHeight * 0.08));
    if (Math.abs(page.scrollTop - target) > 2) page.scrollTop = target;
  }
}

export function focusFirst(scope: ParentNode = activeScope()): void {
  const items = focusables(scope);
  const preferred = items.find((el) => el.hasAttribute('data-autofocus'));
  focusElement(preferred ?? items[0]);
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/** Distance score: travel along the direction plus a heavier penalty for drifting sideways. */
function score(from: Box, to: Box, dir: Direction): number | null {
  const EPS = 1;
  let primary: number;
  let secondary: number;
  switch (dir) {
    case 'right':
      if (to.left < from.right - EPS && to.cx <= from.cx) return null;
      primary = Math.max(0, to.left - from.right);
      secondary = Math.max(0, Math.max(from.top, to.top) - Math.min(from.bottom, to.bottom)) || Math.abs(to.cy - from.cy) * 0.1;
      break;
    case 'left':
      if (to.right > from.left + EPS && to.cx >= from.cx) return null;
      primary = Math.max(0, from.left - to.right);
      secondary = Math.max(0, Math.max(from.top, to.top) - Math.min(from.bottom, to.bottom)) || Math.abs(to.cy - from.cy) * 0.1;
      break;
    case 'down':
      if (to.top < from.bottom - EPS && to.cy <= from.cy) return null;
      primary = Math.max(0, to.top - from.bottom);
      secondary = Math.abs(to.cx - from.cx);
      break;
    case 'up':
      if (to.bottom > from.top + EPS && to.cy >= from.cy) return null;
      primary = Math.max(0, from.top - to.bottom);
      secondary = Math.abs(to.cx - from.cx);
      break;
  }
  return primary + secondary * 2;
}

export function moveFocus(dir: Direction): boolean {
  const scope = activeScope();
  const items = focusables(scope);
  const current = document.activeElement as HTMLElement | null;
  if (!current || items.indexOf(current) === -1) {
    focusFirst(scope);
    return true;
  }
  const from = box(current);
  const currentGroup = groupOf(current);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const s = score(from, box(el), dir);
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (!best) return false;

  const targetGroup = groupOf(best);
  if (targetGroup && targetGroup !== currentGroup) {
    const remembered = lastInGroup.get(targetGroup);
    if (remembered && remembered.isConnected && items.indexOf(remembered) !== -1) best = remembered;
  }
  focusElement(best);
  return true;
}

/** Restores focus to an element by `data-focus-key` (e.g. the video you came back from). */
export function focusByKey(key: string, scope: ParentNode = document): boolean {
  const el = scope.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape ? CSS.escape(key) : key}"]`);
  if (!el) return false;
  focusElement(el);
  return true;
}

export function forgetFocusGroups(): void {
  lastInGroup.clear();
}
