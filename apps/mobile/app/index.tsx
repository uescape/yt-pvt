import type { HouseholdResponse, Profile } from '@curato/core';
import { Redirect, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import { api, ApiError, getToken, setToken } from '../src/api';
import { Avatar, Button, ErrorText, Loading, Muted, RowItem, Section, useColors } from '../src/ui';

function platformName(p: string) {
  return { tizen: 'Samsung TV', webos: 'LG TV', vidaa: 'Hisense TV', androidtv: 'Android TV', firetv: 'Fire TV', browser: 'Browser' }[p] ?? 'TV';
}

function lastSeen(iso: string | null) {
  if (!iso) return 'Never connected';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 10) return 'Online recently';
  if (min < 60 * 24) return `Last seen ${Math.round(min / 60) || 1}h ago`;
  return `Last seen ${Math.round(min / 1440)}d ago`;
}

export default function Home() {
  const c = useColors();
  const [state, setState] = useState<'loading' | 'ready' | 'signed-out'>('loading');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [household, setHousehold] = useState<HouseholdResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!(await getToken())) return setState('signed-out');
    try {
      const [p, h] = await Promise.all([api.profiles(), api.household()]);
      setProfiles(p);
      setHousehold(h);
      setError(null);
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await setToken(null);
        return setState('signed-out');
      }
      setError((e as Error).message);
      setState('ready');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state === 'loading') return <Loading />;
  if (state === 'signed-out') return <Redirect href="/welcome" />;

  const removeTv = (id: string, name: string) =>
    Alert.alert(`Disconnect ${name}?`, 'The TV will go back to the pairing screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void api.removeDevice(id).then(load) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={{ color: c.accent, fontSize: 16 }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <ErrorText error={error} />

      <Section title="Profiles" hint="Each person gets their own rules. Kids profiles show only the channels you add.">
        {profiles.length === 0 ? (
          <RowItem title="No profiles yet" subtitle="Start with a kids profile – it’s the safest setup." last />
        ) : (
          profiles.map((p, i) => (
            <RowItem
              key={p.id}
              title={p.name}
              subtitle={
                p.rules.mode === 'allowlist'
                  ? `Only ${p.rules.channels.length} approved channel${p.rules.channels.length === 1 ? '' : 's'}`
                  : `${p.rules.channels.length} channels + trending · ${p.rules.blockedChannels.length} blocked`
              }
              left={<Avatar emoji={p.avatar.emoji} color={p.avatar.color} />}
              right={<Text style={{ color: c.muted, fontSize: 20 }}>›</Text>}
              onPress={() => router.push(`/profile/${p.id}`)}
              last={i === profiles.length - 1}
            />
          ))
        )}
      </Section>
      <Button title="+ New profile" variant="secondary" onPress={() => router.push('/profile/new')} style={{ marginTop: -12, marginBottom: 28 }} />

      <Section title="TVs" hint="Open Curato on the TV and enter the 6-digit code it shows.">
        {household && household.devices.length > 0 ? (
          household.devices.map((d, i) => (
            <RowItem
              key={d.id}
              title={d.name}
              subtitle={`${platformName(d.platform)} · ${lastSeen(d.lastSeenAt)}`}
              left={<Text style={{ fontSize: 24, marginRight: 12 }}>📺</Text>}
              right={<Text style={{ color: c.danger }}>Remove</Text>}
              onPress={() => removeTv(d.id, d.name)}
              last={i === household.devices.length - 1}
            />
          ))
        ) : (
          <RowItem title="No TVs connected" last />
        )}
      </Section>
      <Button title="Add a TV" onPress={() => router.push('/pair')} style={{ marginTop: -12 }} />

      <Muted style={{ marginTop: 28, textAlign: 'center', fontSize: 12 }}>
        Tip: lock or hide the TV’s built-in YouTube app with the TV’s parental controls so Curato is the only way in.
      </Muted>
    </ScrollView>
  );
}
