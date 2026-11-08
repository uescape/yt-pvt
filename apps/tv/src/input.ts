import { useEffect, useRef } from 'preact/hooks';
import { moveFocus, type Direction } from './focus';
import { exitApp } from './platform';

export type Key = Direction | 'enter' | 'back' | 'playpause' | 'play' | 'pause' | 'stop' | 'ff' | 'rw';

/** Maps remote-control key events from every supported TV platform to logical keys. */
export function toKey(e: KeyboardEvent): Key | null {
  switch (e.key) {
    case 'ArrowUp':
    case 'Up':
      return 'up';
    case 'ArrowDown':
    case 'Down':
      return 'down';
    case 'ArrowLeft':
    case 'Left':
      return 'left';
    case 'ArrowRight':
    case 'Right':
      return 'right';
    case 'Enter':
    case 'Accept':
      return 'enter';
    case 'Escape':
    case 'Backspace':
    case 'GoBack':
    case 'BrowserBack':
    case 'XF86Back':
      return 'back';
    case 'MediaPlayPause':
      return 'playpause';
    case 'MediaPlay':
      return 'play';
    case 'MediaPause':
      return 'pause';
    case 'MediaStop':
      return 'stop';
    case 'MediaFastForward':
      return 'ff';
    case 'MediaRewind':
      return 'rw';
  }
  // Older TV browsers only provide keyCode.
  switch (e.keyCode) {
    case 38:
      return 'up';
    case 40:
      return 'down';
    case 37:
      return 'left';
    case 39:
      return 'right';
    case 13:
      return 'enter';
    case 10009: // Tizen Back
    case 461: // webOS Back
    case 27:
    case 8: // Hisense VIDAA Back (reported as Backspace)
      return 'back';
    case 10252: // Tizen MediaPlayPause
    case 179:
      return 'playpause';
    case 415:
      return 'play';
    case 19:
      return 'pause';
    case 413:
      return 'stop';
    case 417:
      return 'ff';
    case 412:
      return 'rw';
  }
  return null;
}

type KeyHandler = (key: Key) => boolean | void;

/** Handlers are a stack: the most recently mounted screen/modal gets keys first. Return true to consume. */
const stack: Array<{ handler: { current: KeyHandler } }> = [];

export function useKeys(handler: KeyHandler, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry = { handler: ref };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

export function dispatchKey(key: Key): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.handler.current(key) === true) return;
  }
  if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
    moveFocus(key);
    return;
  }
  if (key === 'enter') {
    const el = document.activeElement as HTMLElement | null;
    // <button> already fires click on Enter natively.
    if (el && el.tagName !== 'BUTTON' && el.tagName !== 'INPUT') el.click();
    return;
  }
  if (key === 'back') exitApp();
}

export function installInput(): void {
  document.addEventListener(
    'keydown',
    (e) => {
      const key = toKey(e);
      if (!key) return;
      // Let typing work inside text inputs (dev/browser only).
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' && (e.key === 'Backspace' || key === 'left' || key === 'right')) return;
      if (key !== 'enter') e.preventDefault();
      dispatchKey(key);
    },
    true,
  );
  window.__curatoBack = () => dispatchKey('back');
}
