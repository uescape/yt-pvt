import type { ExclusionReason, PreviewResponse } from '@curato/core';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Text, View } from 'react-native';
import { api } from '../../src/api';
import { ErrorText, Loading, Muted, RowItem, Screen, Section, useColors } from '../../src/ui';

const REASONS: Record<ExclusionReason, string> = {
  'not-embeddable': 'Can’t play outside YouTube / age-restricted',
  region: 'Not available in your country',
  'channel-blocked': 'From a blocked channel',
  'channel-not-allowed': 'From a channel that isn’t approved',
  'not-made-for-kids': 'Not marked “made for kids”',
  live: 'Live or upcoming stream',
  short: 'Shorts',
  'too-short': 'Shorter than your minimum',
  'too-long': 'Longer than your maximum',
  category: 'Blocked topic',
  keyword: 'Contains a blocked word',
};

/** Shows parents exactly what the TV will show, and how much the rules filtered out. */
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) api.preview(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Loading />;

  const shown = new Set(data.rows.flatMap((r) => r.videos.map((v) => v.id))).size;
  const excluded = Object.entries(data.excluded).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as Array<[ExclusionReason, number]>;

  return (
    <Screen>
      <Section title="Summary">
        <RowItem title={`${shown} videos on the TV`} subtitle={`${data.totalCandidates} checked from your channels${data.rows.some((r) => r.id.startsWith('trending')) ? ' and trending' : ''}`} last={excluded.length === 0} />
        {excluded.map(([reason, n], i) => (
          <RowItem key={reason} title={`${n} hidden`} subtitle={REASONS[reason]} last={i === excluded.length - 1} />
        ))}
      </Section>

      {data.rows.length === 0 && <Muted>Nothing passes the rules yet. Add channels or loosen a filter.</Muted>}

      {data.rows.map((row) => (
        <View key={row.id} style={{ marginBottom: 20 }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{row.title}</Text>
          <FlatList
            horizontal
            data={row.videos}
            keyExtractor={(v, i) => `${i}:${v.id}`}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{ width: 200, marginRight: 12 }}>
                <Image source={{ uri: item.thumbnailUrl }} style={{ width: 200, height: 112, borderRadius: 10, backgroundColor: c.card }} />
                <Text numberOfLines={2} style={{ color: c.text, marginTop: 6, fontWeight: '500' }}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
                  {item.channelTitle}
                </Text>
              </View>
            )}
          />
        </View>
      ))}
    </Screen>
  );
}
