import type { ChannelMeta, ProfileInput } from '@curato/core';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';

/**
 * App-wide state:
 * - `drafts`: unsaved profile edits, shared between the profile editor and the channel picker screen.
 * - `channels`: a cache of channel names/avatars by id so lists show titles instead of ids.
 */
interface AppState {
  drafts: Record<string, ProfileInput>;
  setDraft: (profileId: string, draft: ProfileInput | null) => void;
  channels: Record<string, ChannelMeta>;
  rememberChannels: (list: ChannelMeta[]) => void;
  loadChannels: (ids: string[]) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, ProfileInput>>({});
  const [channels, setChannels] = useState<Record<string, ChannelMeta>>({});
  const known = useRef(channels);
  known.current = channels;

  const setDraft = useCallback((profileId: string, draft: ProfileInput | null) => {
    setDrafts((d) => {
      const next = { ...d };
      if (draft) next[profileId] = draft;
      else delete next[profileId];
      return next;
    });
  }, []);

  const rememberChannels = useCallback((list: ChannelMeta[]) => {
    if (list.length === 0) return;
    setChannels((c) => {
      const next = { ...c };
      for (const ch of list) next[ch.id] = ch;
      return next;
    });
  }, []);

  const loadChannels = useCallback(
    async (ids: string[]) => {
      const missing = ids.filter((id) => !known.current[id]);
      if (missing.length > 0) rememberChannels(await api.channels(missing));
    },
    [rememberChannels],
  );

  const value = useMemo(() => ({ drafts, setDraft, channels, rememberChannels, loadChannels }), [drafts, channels, setDraft, rememberChannels, loadChannels]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
