import type { TvProfileSummary } from '@curato/core';
import { useEffect } from 'preact/hooks';
import { Avatar, Button, Message } from '../components/ui';
import { focusByKey, focusFirst } from '../focus';

export function ProfilePicker(props: {
  profiles: TvProfileSummary[];
  lastProfileId: string | null;
  onPick: (p: TvProfileSummary) => void;
  onSettings: () => void;
  onRefresh: () => void;
}) {
  useEffect(() => {
    if (!props.lastProfileId || !focusByKey(`profile-${props.lastProfileId}`)) focusFirst();
  }, [props.profiles]);

  if (props.profiles.length === 0) {
    return (
      <Message
        title="No profiles yet"
        actions={
          <>
            <Button autofocus onClick={props.onRefresh}>
              Refresh
            </Button>
            <Button variant="ghost" onClick={props.onSettings}>
              Settings
            </Button>
          </>
        }
      >
        Create a profile in the Curato phone app, choose the channels it may watch, then press Refresh.
      </Message>
    );
  }

  return (
    <div class="profiles">
      <h1>Who’s watching?</h1>
      <div class="profile-grid">
        {props.profiles.map((p) => (
          <button key={p.id} type="button" class="profile-tile" data-focusable data-focus-key={`profile-${p.id}`} onClick={() => props.onPick(p)}>
            <Avatar avatar={p.avatar} size="lg" />
            <span class="profile-name">{p.name}</span>
            <span class="profile-tag">{p.pinToEnter ? '🔒 PIN' : p.kind === 'kids' ? 'Kids' : ''}</span>
          </button>
        ))}
      </div>
      <div class="profiles-footer">
        <Button variant="ghost" onClick={props.onSettings}>
          ⚙ Settings
        </Button>
      </div>
    </div>
  );
}
