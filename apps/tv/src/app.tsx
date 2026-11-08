import type { HomeResponse, TvProfileSummary, TvSessionResponse, VideoCard } from '@curato/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from './api';
import { Button, Message, Spinner } from './components/ui';
import { useKeys } from './input';
import { exitApp } from './platform';
import { Home, type HomeSelection } from './screens/Home';
import { Pairing } from './screens/Pairing';
import { PinPad } from './screens/PinPad';
import { Player } from './screens/Player';
import { ProfilePicker } from './screens/ProfilePicker';
import { Settings } from './screens/Settings';
import { storage } from './storage';

type Screen =
  | { name: 'boot' }
  | { name: 'pair' }
  | { name: 'profiles' }
  | { name: 'home'; profileId: string; restoreFocusKey: string | null }
  | { name: 'player'; profileId: string; video: VideoCard; queue: VideoCard[]; returnFocusKey: string }
  | { name: 'settings' }
  | { name: 'error'; message: string };

interface PinRequest {
  title: string;
  onSuccess: () => void;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [session, setSession] = useState<TvSessionResponse | null>(null);
  const [pin, setPin] = useState<PinRequest | null>(null);
  const homeCache = useRef<Record<string, HomeResponse>>({});

  const resetToPairing = () => {
    storage.setToken(null);
    storage.setLastProfile(null);
    homeCache.current = {};
    setSession(null);
    setScreen({ name: 'pair' });
  };

  const boot = async () => {
    if (!storage.getToken()) return setScreen({ name: 'pair' });
    setScreen({ name: 'boot' });
    try {
      const s = await api.session();
      setSession(s);
      // Kids switch the TV on and land straight in their profile.
      const last = s.profiles.find((p) => p.id === storage.getLastProfile());
      const only = s.profiles.length === 1 ? s.profiles[0] : undefined;
      const auto = last && !last.pinToEnter ? last : only && !only.pinToEnter ? only : undefined;
      setScreen(auto ? { name: 'home', profileId: auto.id, restoreFocusKey: null } : { name: 'profiles' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return resetToPairing();
      setScreen({ name: 'error', message: (e as Error).message });
    }
  };

  useEffect(() => {
    void boot();
  }, []);

  const withPin = (title: string, action: () => void) => {
    if (!session?.hasPin) return action();
    setPin({
      title,
      onSuccess: () => {
        setPin(null);
        action();
      },
    });
  };

  const openProfile = (p: TvProfileSummary) => {
    const go = () => {
      storage.setLastProfile(p.id);
      setScreen({ name: 'home', profileId: p.id, restoreFocusKey: null });
    };
    if (p.pinToEnter) withPin(`Enter PIN for ${p.name}`, go);
    else go();
  };

  const leaveProfile = () => {
    storage.setLastProfile(null);
    void api
      .session()
      .then(setSession)
      .catch(() => undefined);
    setScreen({ name: 'profiles' });
  };

  useKeys((key) => {
    if (key !== 'back' || pin) return false;
    if (screen.name === 'profiles' || screen.name === 'pair' || screen.name === 'error') {
      exitApp();
      return true;
    }
    return false;
  });

  let content;
  switch (screen.name) {
    case 'boot':
      content = <Spinner />;
      break;
    case 'pair':
      content = (
        <Pairing
          onPaired={(token) => {
            storage.setToken(token);
            void boot();
          }}
        />
      );
      break;
    case 'error':
      content = (
        <Message title="Something went wrong" actions={<Button autofocus onClick={() => void boot()}>Try again</Button>}>
          {screen.message}
        </Message>
      );
      break;
    case 'profiles':
      content = (
        <ProfilePicker
          profiles={session?.profiles ?? []}
          lastProfileId={storage.getLastProfile()}
          onPick={openProfile}
          onRefresh={() => void boot()}
          onSettings={() => withPin('Enter PIN to open settings', () => setScreen({ name: 'settings' }))}
        />
      );
      break;
    case 'home':
      content = (
        <Home
          key={screen.profileId}
          profileId={screen.profileId}
          cached={homeCache.current[screen.profileId] ?? null}
          restoreFocusKey={screen.restoreFocusKey}
          onLoaded={(h) => (homeCache.current[screen.profileId] = h)}
          onUnauthorized={resetToPairing}
          onBack={leaveProfile}
          onSelect={(sel: HomeSelection) =>
            setScreen({ name: 'player', profileId: screen.profileId, video: sel.video, queue: sel.queue, returnFocusKey: sel.focusKey })
          }
        />
      );
      break;
    case 'player': {
      const settings = homeCache.current[screen.profileId]?.player ?? { privacyEnhanced: true, autoplayNext: false, sponsorSkip: 'off' as const };
      content = (
        <Player
          key={`${screen.video.id}:${screen.queue.length}`}
          video={screen.video}
          queue={screen.queue}
          settings={settings}
          onExit={() => setScreen({ name: 'home', profileId: screen.profileId, restoreFocusKey: screen.returnFocusKey })}
          onPlay={(video, queue) => setScreen({ ...screen, video, queue })}
        />
      );
      break;
    }
    case 'settings':
      content = <Settings onBack={() => setScreen({ name: 'profiles' })} onUnpaired={resetToPairing} />;
      break;
  }

  return (
    <div class="app">
      {content}
      {pin && <PinPad title={pin.title} onSuccess={pin.onSuccess} onCancel={() => setPin(null)} />}
    </div>
  );
}
