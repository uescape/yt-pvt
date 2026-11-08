import type { PairStartResponse } from '@curato/core';
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { Button, Message, Spinner } from '../components/ui';
import { platformLabel } from '../platform';

const POLL_MS = 3000;

/** First run: show a 6-digit code; the parent enters it in the Curato phone app. */
export function Pairing({ onPaired }: { onPaired: (token: string) => void }) {
  const [pairing, setPairing] = useState<PairStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null);
    setPairing(null);

    const poll = async (p: PairStartResponse) => {
      if (cancelled) return;
      try {
        const status = await api.pairingStatus(p.pairingId, p.pollToken);
        if (cancelled) return;
        if (status.status === 'paired') return onPaired(status.deviceToken);
        if (status.status === 'expired') return setAttempt((a) => a + 1); // fresh code
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return setAttempt((a) => a + 1);
      }
      timer = setTimeout(() => poll(p), POLL_MS);
    };

    api
      .startPairing()
      .then((p) => {
        if (cancelled) return;
        setPairing(p);
        timer = setTimeout(() => poll(p), POLL_MS);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt]);

  if (error) {
    return (
      <Message title="Couldn’t connect" actions={<Button autofocus onClick={() => setAttempt((a) => a + 1)}>Try again</Button>}>
        {error}
      </Message>
    );
  }
  if (!pairing) return <Spinner label="Getting a pairing code…" />;

  return (
    <div class="pairing">
      <div class="pairing-text">
        <div class="brand">Curato</div>
        <h1>Connect this {platformLabel()}</h1>
        <ol class="steps">
          <li>Open the <strong>Curato</strong> app on your phone</li>
          <li>
            Tap <strong>Add a TV</strong>
          </li>
          <li>Enter this code</li>
        </ol>
        <p class="muted small">The code changes every 10 minutes. Your phone app controls what this TV can show.</p>
      </div>
      <div class="pairing-code" aria-label={`Pairing code ${pairing.code.split('').join(' ')}`}>
        {pairing.code.split('').map((d, i) => (
          <span key={i} class="digit">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
