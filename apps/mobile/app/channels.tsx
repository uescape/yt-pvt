import { parseChannelInput, type ChannelMeta } from '@curato/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { api } from '../src/api';
import { useAppState } from '../src/state';
import { Button, ErrorText, Input, Muted, RowItem, Screen, Section, useColors } from '../src/ui';

function formatSubs(n: number | null) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M subscribers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K subscribers`;
  return `${n} subscribers`;
}

/**
 * Add a channel to a profile's approved or blocked list.
 * Links and @handles resolve for 1 quota unit; free-text search costs 100, so we nudge parents towards links.
 */
export default function ChannelPicker() {
  const c = useColors();
  const { profileId, list } = useLocalSearchParams<{ profileId: string; list: 'channels' | 'blockedChannels' }>();
  const { drafts, setDraft, rememberChannels } = useAppState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChannelMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = profileId ? drafts[profileId] : undefined;
  const blocking = list === 'blockedChannels';
  const current = draft && list ? draft.rules[list] : [];

  const find = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const lookup = parseChannelInput(q);
      const found = lookup.kind === 'query' ? await api.searchChannels(q) : [await api.resolveChannel(q)];
      rememberChannels(found);
      setResults(found);
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  const add = (ch: ChannelMeta) => {
    if (!draft || !profileId || !list) return;
    const other = list === 'channels' ? 'blockedChannels' : 'channels';
    setDraft(profileId, {
      ...draft,
      rules: {
        ...draft.rules,
        [list]: current.includes(ch.id) ? current : [...current, ch.id],
        // A channel can't be both approved and blocked.
        [other]: draft.rules[other].filter((id) => id !== ch.id),
      },
    });
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: blocking ? 'Block a channel' : 'Add a channel' }} />
      <Muted style={{ marginBottom: 12, fontSize: 15 }}>
        Easiest: in the YouTube app, open the channel → Share → Copy link, and paste it here. A link to any of the channel’s videos works too.
      </Muted>
      <Section title="Channel link, @handle or name">
        <View style={{ padding: 12 }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="https://youtube.com/@channel or @handle"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={find}
          />
        </View>
      </Section>
      <Button title="Find channel" onPress={find} loading={busy} disabled={!query.trim()} />
      <ErrorText error={error} />

      {results && (
        <View style={{ marginTop: 20 }}>
          <Section title={results.length === 0 ? 'No channels found' : 'Tap to add'}>
            {results.map((ch, i) => (
              <RowItem
                key={ch.id}
                title={ch.title}
                subtitle={[ch.handle, formatSubs(ch.subscriberCount)].filter(Boolean).join(' · ')}
                left={<Image source={{ uri: ch.thumbnailUrl }} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }} />}
                right={
                  current.includes(ch.id) ? (
                    <Text style={{ color: c.muted }}>Added</Text>
                  ) : (
                    <Text style={{ color: blocking ? c.danger : c.accent, fontWeight: '600' }}>{blocking ? 'Block' : 'Add'}</Text>
                  )
                }
                onPress={() => add(ch)}
                last={i === results.length - 1}
              />
            ))}
          </Section>
        </View>
      )}
    </Screen>
  );
}
