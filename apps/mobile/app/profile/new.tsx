import type { ProfileKind } from '@curato/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../src/api';
import { Button, ErrorText, Input, RowItem, Screen, Section } from '../../src/ui';

const OPTIONS: Array<{ kind: ProfileKind; title: string; subtitle: string; emoji: string }> = [
  {
    kind: 'kids',
    emoji: '🧸',
    title: 'Kids',
    subtitle: 'Only channels you approve · made-for-kids videos · no Shorts or live · max 20 min · no autoplay',
  },
  {
    kind: 'standard',
    emoji: '🎬',
    title: 'Grown-up',
    subtitle: 'Your channels plus trending topics · block channels & keywords · Shorts hidden · PIN to open',
  },
];

export default function NewProfile() {
  const [kind, setKind] = useState<ProfileKind>('kids');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProfile(kind, name.trim() || (kind === 'kids' ? 'Kids' : 'Me'));
      router.replace(`/profile/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Section title="Start from">
        {OPTIONS.map((o, i) => (
          <RowItem
            key={o.kind}
            title={`${o.emoji}  ${o.title}`}
            subtitle={o.subtitle}
            right={kind === o.kind ? <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B6CFF' }} /> : undefined}
            onPress={() => setKind(o.kind)}
            last={i === OPTIONS.length - 1}
          />
        ))}
      </Section>
      <Section title="Name">
        <View style={{ padding: 12 }}>
          <Input value={name} onChangeText={setName} placeholder={kind === 'kids' ? 'e.g. Ali' : 'e.g. Parents'} maxLength={30} />
        </View>
      </Section>
      <ErrorText error={error} />
      <Button title="Create profile" onPress={create} loading={busy} />
    </Screen>
  );
}
