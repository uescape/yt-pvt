import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Button } from '../components/ui';
import { focusFirst } from '../focus';
import { useKeys } from '../input';
import { platform, platformLabel } from '../platform';

const LOCK_TIPS: Record<string, string> = {
  tizen: 'Samsung: Settings → General → Smart Features → Apps → Lock/Unlock the YouTube app with a PIN.',
  webos: 'LG: Settings → General → Safety (or Parental Controls) → Application Locks → lock YouTube.',
  vidaa: 'Hisense (VIDAA): Settings → System → Parental Control → turn it on, then lock or hide the YouTube app (menu names vary by model).',
  androidtv: 'Google TV: create a Kids profile in the system settings, or disable YouTube under Settings → Apps.',
  firetv: 'Fire TV: Settings → Preferences → Parental Controls → turn on, then lock or hide the YouTube app.',
  browser: 'On TVs, lock or hide the built-in YouTube app with the TV’s parental controls.',
};

export function Settings({ onBack, onUnpaired }: { onBack: () => void; onUnpaired: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => focusFirst(), [confirming]);

  useKeys((key) => {
    if (key === 'back') {
      if (confirming) setConfirming(false);
      else onBack();
      return true;
    }
    return false;
  });

  const unpair = async () => {
    await api.unpair().catch(() => undefined);
    onUnpaired();
  };

  return (
    <div class="settings">
      <h1>Settings</h1>
      <div class="settings-card">
        <h2>Keep kids inside Curato</h2>
        <p class="muted">
          Curato can’t block the TV’s built-in YouTube app, so lock or hide it with the TV’s own parental controls.
        </p>
        <p>{LOCK_TIPS[platform]}</p>
      </div>
      <div class="settings-card">
        <h2>This TV</h2>
        <p class="muted">
          {platformLabel()} · Curato v{__APP_VERSION__}
        </p>
        <div class="actions left">
          <Button autofocus onClick={() => window.location.reload()}>
            Reload
          </Button>
          {confirming ? (
            <Button variant="ghost" onClick={unpair} class="danger">
              Yes, disconnect this TV
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Disconnect this TV
            </Button>
          )}
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
      <p class="muted small legal">
        Videos are provided by YouTube and play in the official YouTube player. Curato is not affiliated with or endorsed by YouTube or Google.
      </p>
    </div>
  );
}
