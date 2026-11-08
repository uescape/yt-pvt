import type { Avatar as AvatarData, VideoCard as VideoCardData } from '@curato/core';
import type { ComponentChildren } from 'preact';
import { formatDuration, timeAgo } from '../format';

export function Avatar({ avatar, size = 'md' }: { avatar: AvatarData; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span class={`avatar avatar-${size}`} style={{ background: avatar.color }} aria-hidden="true">
      {avatar.emoji}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div class="center-fill">
      <div class="spinner" role="progressbar" aria-label={label ?? 'Loading'} />
      {label && <p class="muted">{label}</p>}
    </div>
  );
}

export function Button(props: {
  children: ComponentChildren;
  onClick: () => void;
  variant?: 'primary' | 'ghost';
  autofocus?: boolean;
  focusKey?: string;
  class?: string;
}) {
  return (
    <button
      type="button"
      class={`btn btn-${props.variant ?? 'primary'} ${props.class ?? ''}`}
      data-focusable
      data-autofocus={props.autofocus ? '' : undefined}
      data-focus-key={props.focusKey}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function VideoCard({ video, focusKey, onSelect, autofocus }: { video: VideoCardData; focusKey: string; onSelect: () => void; autofocus?: boolean }) {
  return (
    <button type="button" class="card" data-focusable data-autofocus={autofocus ? '' : undefined} data-focus-key={focusKey} onClick={onSelect} aria-label={`${video.title}, ${video.channelTitle}`}>
      <span class="card-thumb">
        <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        {video.durationSec ? <span class="badge">{formatDuration(video.durationSec)}</span> : null}
      </span>
      <span class="card-title">{video.title}</span>
      <span class="card-meta">
        {video.channelTitle} · {timeAgo(video.publishedAt)}
      </span>
    </button>
  );
}

export function Message({ title, children, actions }: { title: string; children?: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="center-fill message">
      <h1>{title}</h1>
      {children && <div class="muted message-body">{children}</div>}
      {actions && <div class="actions">{actions}</div>}
    </div>
  );
}
