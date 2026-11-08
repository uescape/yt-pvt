import type { PlayerSettings, VideoCard as VideoCardData } from '@curato/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { Button, VideoCard } from '../components/ui';
import { focusFirst } from '../focus';
import { formatDuration } from '../format';
import { useKeys } from '../input';
import { activeSegment, fetchSponsorSegments, type Segment } from '../sponsorblock';
import { describePlayerError, loadYouTubeApi, PLAYER_STATE, playerVars, type YTPlayer } from '../youtube';

const CONTROLS_HIDE_MS = 4000;
const UP_NEXT_SECONDS = 8;
const SEEK_STEP = 10;
const SEEK_STEP_FAST = 30;

type Phase = 'loading' | 'playing' | 'ended' | 'error';

/**
 * Full-screen playback with the official YouTube IFrame player.
 * Ads are YouTube's and play untouched. Our controls only appear on remote input and auto-hide.
 * When a video ends we cover YouTube's end screen with OUR filtered "Up next", so nothing outside
 * the profile's rules can be reached from here.
 */
export function Player(props: {
  video: VideoCardData;
  queue: VideoCardData[];
  settings: PlayerSettings;
  onExit: () => void;
  onPlay: (video: VideoCardData, queue: VideoCardData[]) => void;
}) {
  const { video, queue, settings } = props;
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [controls, setControls] = useState(true);
  const [errorText, setErrorText] = useState('');
  /** True when only THIS video is broken (skip it); false when the player itself failed (don't loop through the queue). */
  const [skipOnError, setSkipOnError] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const showControls = () => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), CONTROLS_HIDE_MS);
  };

  // Create the player.
  useEffect(() => {
    let disposed = false;
    setPhase('loading');
    setTime({ current: 0, duration: 0 });
    setCountdown(null);
    setSegments([]);

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !host.current) return;
        const mount = document.createElement('div');
        host.current.innerHTML = '';
        host.current.appendChild(mount);
        player.current = new YT.Player(mount, {
          videoId: video.id,
          host: settings.privacyEnhanced ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
          width: '100%',
          height: '100%',
          playerVars: playerVars(window.location.origin),
          events: {
            onReady: (e) => {
              e.target.playVideo();
            },
            onStateChange: (e) => {
              if (e.data === PLAYER_STATE.PLAYING) {
                setPhase('playing');
                setPaused(false);
              } else if (e.data === PLAYER_STATE.PAUSED) {
                setPaused(true);
                setControls(true);
              } else if (e.data === PLAYER_STATE.ENDED) {
                setPhase('ended');
              }
            },
            onError: (e) => {
              const info = describePlayerError(e.data);
              setErrorText(info.message);
              setSkipOnError(info.unplayable);
              setPhase('error');
              if (info.unplayable) void api.reportUnplayable(video.id).catch(() => undefined);
            },
          },
        });
      })
      .catch((e: Error) => {
        if (disposed) return;
        setErrorText(`${e.message}. Check the TV’s internet connection.`);
        setSkipOnError(false);
        setPhase('error');
      });

    if (settings.sponsorSkip === 'button') void fetchSponsorSegments(video.id).then((s) => !disposed && setSegments(s));
    showControls();

    return () => {
      disposed = true;
      try {
        player.current?.destroy();
      } catch {
        /* ignore */
      }
      player.current = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [video.id]);

  // Progress polling + keep keyboard focus out of the iframe (e.g. after a Magic Remote click),
  // otherwise the remote would stop controlling our app.
  useEffect(() => {
    const id = setInterval(() => {
      const p = player.current;
      if (p && typeof p.getCurrentTime === 'function') {
        try {
          setTime({ current: p.getCurrentTime() || 0, duration: p.getDuration() || 0 });
        } catch {
          /* player not ready */
        }
      }
      if (document.activeElement?.tagName === 'IFRAME') {
        (document.activeElement as HTMLElement).blur();
        window.focus();
        focusFirst();
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Up-next countdown.
  useEffect(() => {
    if (phase !== 'ended' && phase !== 'error') return;
    const next = queue[0];
    const auto = phase === 'error' ? skipOnError && !!next : settings.autoplayNext && !!next;
    setControls(true);
    setTimeout(() => focusFirst(), 0);
    if (!auto) return;
    setCountdown(phase === 'error' ? 4 : UP_NEXT_SECONDS);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return c;
        if (c <= 1) {
          clearInterval(id);
          props.onPlay(next!, queue.slice(1));
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const seekBy = (delta: number) => {
    const p = player.current;
    if (!p) return;
    try {
      const t = Math.max(0, Math.min((p.getDuration() || 0) - 1, (p.getCurrentTime() || 0) + delta));
      p.seekTo(t, true);
      setTime((s) => ({ ...s, current: t }));
    } catch {
      /* ignore */
    }
    showControls();
  };

  const togglePlay = () => {
    const p = player.current;
    if (!p) return;
    try {
      if (p.getPlayerState() === PLAYER_STATE.PLAYING) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* ignore */
    }
    showControls();
  };

  const segment = settings.sponsorSkip === 'button' ? activeSegment(segments, time.current) : null;

  useKeys((key) => {
    if (key === 'back') {
      props.onExit();
      return true;
    }
    if (phase === 'ended' || phase === 'error') return false; // spatial nav over the end screen
    switch (key) {
      case 'playpause':
        togglePlay();
        return true;
      case 'play':
        player.current?.playVideo();
        showControls();
        return true;
      case 'pause':
        player.current?.pauseVideo();
        showControls();
        return true;
      case 'stop':
        props.onExit();
        return true;
      case 'ff':
        seekBy(SEEK_STEP_FAST);
        return true;
      case 'rw':
        seekBy(-SEEK_STEP_FAST);
        return true;
    }
    if (!controls) {
      // First press wakes the controls. Left/right seek straight away, like every TV player.
      if (key === 'left') seekBy(-SEEK_STEP);
      else if (key === 'right') seekBy(SEEK_STEP);
      else showControls();
      setTimeout(() => focusFirst(), 0);
      return true;
    }
    showControls();
    return false; // spatial navigation between control buttons
  });

  useEffect(() => {
    if (segment) {
      showControls();
      setTimeout(() => focusFirst(), 0);
    }
  }, [segment?.start]);

  const pct = time.duration > 0 ? Math.min(100, (time.current / time.duration) * 100) : 0;
  const next = queue[0];

  return (
    <div class="player">
      <div class="player-frame" ref={host} />

      {phase === 'loading' && <div class="player-loading"><div class="spinner" /></div>}

      {(phase === 'playing' || phase === 'loading') && (
        <div class={`player-overlay ${controls || paused ? 'visible' : ''}`} data-focus-scope>
          <div class="player-top">
            <div class="player-title">{video.title}</div>
            <div class="player-channel">{video.channelTitle}</div>
          </div>
          <div class="player-bottom">
            {segment && (
              <div class="sponsor">
                <Button autofocus onClick={() => player.current?.seekTo(segment.end, true)}>
                  Skip sponsor ⏭
                </Button>
              </div>
            )}
            <div class="progress">
              <div class="progress-fill" style={{ width: `${pct}%` }} />
              {segments.map((s, i) =>
                time.duration > 0 ? (
                  <div key={i} class="progress-segment" style={{ left: `${(s.start / time.duration) * 100}%`, width: `${((s.end - s.start) / time.duration) * 100}%` }} />
                ) : null,
              )}
            </div>
            <div class="player-controls">
              <span class="time">
                {formatDuration(time.current)} / {formatDuration(time.duration)}
              </span>
              <div class="control-buttons">
                <button type="button" class="ctl" data-focusable onClick={() => seekBy(-SEEK_STEP)} aria-label="Back 10 seconds">
                  ⟲ 10
                </button>
                <button type="button" class="ctl ctl-main" data-focusable data-autofocus={segment ? undefined : ''} onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
                  {paused ? '▶' : '❚❚'}
                </button>
                <button type="button" class="ctl" data-focusable onClick={() => seekBy(SEEK_STEP)} aria-label="Forward 10 seconds">
                  10 ⟳
                </button>
                {next && (
                  <button type="button" class="ctl" data-focusable onClick={() => props.onPlay(next, queue.slice(1))} aria-label="Next video">
                    ⏭
                  </button>
                )}
              </div>
              <span class="hint">Back to exit</span>
            </div>
          </div>
        </div>
      )}

      {(phase === 'ended' || phase === 'error') && (
        <div class="endscreen" data-focus-scope>
          <h1>{phase === 'error' ? errorText : next ? 'Up next' : 'That’s the end'}</h1>
          {countdown !== null && next && <p class="muted">Playing in {countdown}…</p>}
          {next && (
            <div class="endscreen-cards">
              {queue.slice(0, 4).map((v, i) => (
                <VideoCard key={`${i}:${v.id}`} video={v} focusKey={`next-${i}`} onSelect={() => props.onPlay(v, queue.slice(i + 1))} />
              ))}
            </div>
          )}
          <div class="actions">
            {phase === 'ended' && (
              <Button variant="ghost" onClick={() => props.onPlay(video, queue)}>
                ↺ Watch again
              </Button>
            )}
            <Button variant="ghost" autofocus={!next} onClick={props.onExit}>
              Back to videos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
