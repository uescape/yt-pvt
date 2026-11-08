import type { HomeResponse, VideoCard as VideoCardData } from '@curato/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { Avatar, Button, Message, Spinner, VideoCard } from '../components/ui';
import { focusByKey, focusFirst, forgetFocusGroups } from '../focus';
import { clock } from '../format';
import { useKeys } from '../input';

const REFRESH_MS = 15 * 60_000;

export interface HomeSelection {
  video: VideoCardData;
  /** The rest of the row after the chosen video: used for "Up next". */
  queue: VideoCardData[];
  focusKey: string;
}

export function Home(props: {
  profileId: string;
  cached: HomeResponse | null;
  restoreFocusKey: string | null;
  onLoaded: (home: HomeResponse) => void;
  onSelect: (sel: HomeSelection) => void;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  const [home, setHome] = useState<HomeResponse | null>(props.cached);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(clock());
  const focusedOnce = useRef(false);

  const load = () => {
    setError(null);
    api
      .home(props.profileId)
      .then((h) => {
        setHome(h);
        props.onLoaded(h);
      })
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401) return props.onUnauthorized();
        if (!home) setError(e.message);
      });
  };

  useEffect(() => {
    if (!props.cached) forgetFocusGroups();
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(clock()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [props.profileId]);

  useEffect(() => {
    if (!home || focusedOnce.current) return;
    focusedOnce.current = true;
    if (!props.restoreFocusKey || !focusByKey(props.restoreFocusKey)) focusFirst();
  }, [home]);

  useKeys((key) => {
    if (key === 'back') {
      props.onBack();
      return true;
    }
    return false;
  });

  if (error) {
    return (
      <Message title="Couldn’t load videos" actions={<Button autofocus onClick={load}>Try again</Button>}>
        {error}
      </Message>
    );
  }
  if (!home) return <Spinner />;

  return (
    <div class="home" data-vscroll>
      <header class="home-header" data-scroll-anchor>
        <button type="button" class="profile-chip" data-focusable onClick={props.onBack} aria-label="Switch profile">
          <Avatar avatar={home.profile.avatar} size="sm" />
          <span>{home.profile.name}</span>
        </button>
        <div class="brand small">Curato</div>
        <div class="clock">{now}</div>
      </header>

      {home.rows.length === 0 ? (
        <Message title="Nothing to watch yet">
          {home.profile.kind === 'kids'
            ? 'Ask a parent to add channels to this profile in the Curato phone app.'
            : 'Add channels or trending topics to this profile in the Curato phone app.'}
        </Message>
      ) : (
        home.rows.map((row, rowIndex) => (
          <section key={row.id} class="row" data-scroll-anchor>
            <h2 class="row-title">{row.title}</h2>
            <div class="row-items" data-row data-focus-group={row.id}>
              {row.videos.map((v, i) => {
                const focusKey = `${row.id}:${i}:${v.id}`;
                return (
                  <VideoCard
                    key={focusKey}
                    video={v}
                    focusKey={focusKey}
                    autofocus={rowIndex === 0 && i === 0}
                    onSelect={() => props.onSelect({ video: v, queue: row.videos.slice(i + 1), focusKey })}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
