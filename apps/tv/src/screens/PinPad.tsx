import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { focusElement, focusFirst } from '../focus';
import { useKeys } from '../input';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'];

/** Modal PIN entry, navigable with the D-pad. Number keys on the remote work too. */
export function PinPad({ title, onSuccess, onCancel }: { title: string; onSuccess: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    focusFirst();
    return () => focusElement(previous && previous.isConnected ? previous : null);
  }, []);

  const submit = async (value: string) => {
    if (value.length < 4 || status === 'checking') return;
    setStatus('checking');
    try {
      if (await api.verifyPin(value)) return onSuccess();
      setStatus('wrong');
      setPin('');
    } catch (e) {
      setStatus('error');
      setErrorText((e as Error).message);
      setPin('');
    }
  };

  const press = (k: string) => {
    if (k === 'clear') return setPin((p) => p.slice(0, -1));
    if (k === 'ok') return void submit(pin);
    if (pin.length >= 8) return;
    const next = pin + k;
    setPin(next);
    setStatus('idle');
  };

  useKeys((key) => {
    if (key === 'back') {
      onCancel();
      return true;
    }
    return false;
  });

  useEffect(() => {
    const onDigit = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
    };
    document.addEventListener('keydown', onDigit);
    return () => document.removeEventListener('keydown', onDigit);
  });

  return (
    <div class="modal-backdrop" data-focus-scope>
      <div class="modal pin" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div class="pin-dots" aria-live="polite">
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} class={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>
        <p class={`pin-status ${status === 'wrong' || status === 'error' ? 'error' : 'muted'}`}>
          {status === 'wrong' ? 'Wrong PIN, try again' : status === 'error' ? errorText : status === 'checking' ? 'Checking…' : 'Enter the parent PIN'}
        </p>
        <div class="pin-grid">
          {KEYS.map((k) => (
            <button key={k} type="button" class={`pin-key ${k === 'ok' ? 'pin-ok' : ''}`} data-focusable data-autofocus={k === '5' ? '' : undefined} onClick={() => press(k)}>
              {k === 'clear' ? '⌫' : k === 'ok' ? 'OK' : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
