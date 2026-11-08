import { CATEGORIES, categoryName, profileInputSchema, TRENDING_ALL, type ProfileInput } from '@curato/core';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { api } from '../../src/api';
import { useAppState } from '../../src/state';
import { Avatar, Button, Chip, ChipGroup, ErrorText, Input, Loading, Muted, RowItem, Screen, Section, SwitchRow, useColors } from '../../src/ui';

const EMOJIS = ['🧸', '🦖', '🦄', '🚀', '🐼', '⚽', '🎨', '🎬', '🎮', '📚', '🌈', '🐱'];
const COLORS = ['#F59E0B', '#16A34A', '#DB2777', '#2563EB', '#7C3AED', '#0891B2', '#DC2626', '#6366F1'];
const MAX_LENGTHS: Array<{ label: string; value: number | null }> = [
  { label: 'No limit', value: null },
  { label: '10 min', value: 600 },
  { label: '20 min', value: 1200 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
];
const MIN_LENGTHS: Array<{ label: string; value: number | null }> = [
  { label: 'Any', value: null },
  { label: '1 min+', value: 60 },
  { label: '5 min+', value: 300 },
  { label: '10 min+', value: 600 },
];

export default function ProfileEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const navigation = useNavigation();
  const { drafts, setDraft, channels, loadChannels } = useAppState();
  const [saved, setSaved] = useState<ProfileInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');

  const draft = id ? drafts[id] : undefined;
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (!id) return;
    api
      .profile(id)
      .then(({ id: _id, createdAt: _c, updatedAt: _u, ...input }) => {
        setSaved(input);
        if (!drafts[id]) setDraft(id, input);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (draft) void loadChannels([...draft.rules.channels, ...draft.rules.blockedChannels]).catch(() => undefined);
  }, [draft?.rules.channels.length, draft?.rules.blockedChannels.length]);

  // Don't silently lose edits.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty) {
          if (id) setDraft(id, null);
          return;
        }
        e.preventDefault();
        Alert.alert('Discard changes?', 'Your changes to this profile haven’t been saved.', [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (id) setDraft(id, null);
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }),
    [navigation, dirty, id],
  );

  if (!id) return null;
  if (!draft) return error ? <ErrorText error={error} /> : <Loading />;

  const update = (patch: Partial<ProfileInput>) => setDraft(id, { ...draft, ...patch });
  const rules = (patch: Partial<ProfileInput['rules']>) => update({ rules: { ...draft.rules, ...patch } });
  const player = (patch: Partial<ProfileInput['player']>) => update({ player: { ...draft.player, ...patch } });
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    const parsed = profileInputSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return setError(issue ? `${issue.path.join(' › ')}: ${issue.message}` : 'Invalid profile');
    }
    setSaving(true);
    setError(null);
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, ...input } = await api.saveProfile(id, parsed.data);
      setSaved(input);
      setDraft(id, input);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(`Delete ${draft.name}?`, 'TVs will no longer show this profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteProfile(id);
          setSaved(draft); // not dirty anymore
          setDraft(id, null);
          router.back();
        },
      },
    ]);

  const addKeyword = () => {
    const k = keyword.trim();
    if (k && !draft.rules.blockedKeywords.includes(k)) rules({ blockedKeywords: [...draft.rules.blockedKeywords, k] });
    setKeyword('');
  };

  const channelRow = (channelId: string, list: 'channels' | 'blockedChannels', last: boolean) => {
    const ch = channels[channelId];
    return (
      <RowItem
        key={channelId}
        title={ch?.title ?? channelId}
        subtitle={ch?.handle ?? undefined}
        left={
          ch?.thumbnailUrl ? (
            <Image source={{ uri: ch.thumbnailUrl }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12 }} />
          ) : (
            <Text style={{ fontSize: 22, marginRight: 12 }}>📺</Text>
          )
        }
        right={<Text style={{ color: c.danger }}>Remove</Text>}
        onPress={() => rules({ [list]: draft.rules[list].filter((x) => x !== channelId) })}
        last={last}
      />
    );
  };

  const allowlist = draft.rules.mode === 'allowlist';

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: draft.name,
          headerRight: () => (
            <Pressable onPress={save} disabled={!dirty || saving} hitSlop={12}>
              <Text style={{ color: dirty ? c.accent : c.muted, fontSize: 16, fontWeight: '600' }}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          ),
        }}
      />
      <ErrorText error={error} />

      <Section title="Profile">
        <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Avatar emoji={draft.avatar.emoji} color={draft.avatar.color} size={52} />
          <View style={{ flex: 1 }}>
            <Input value={draft.name} onChangeText={(name) => update({ name })} maxLength={30} />
          </View>
        </View>
        <ChipGroup>
          {EMOJIS.map((e) => (
            <Chip key={e} label={e} selected={draft.avatar.emoji === e} onPress={() => update({ avatar: { ...draft.avatar, emoji: e } })} />
          ))}
        </ChipGroup>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 12 }}>
          {COLORS.map((col) => (
            <Pressable
              key={col}
              onPress={() => update({ avatar: { ...draft.avatar, color: col } })}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, marginRight: 10, borderWidth: draft.avatar.color === col ? 3 : 0, borderColor: c.text }}
            />
          ))}
        </View>
        <SwitchRow
          title="Require PIN on the TV"
          subtitle="Turn on for grown-up profiles so kids can’t switch into them."
          value={draft.pinToEnter}
          onChange={(pinToEnter) => update({ pinToEnter })}
          last
        />
      </Section>

      <Section
        title="What can be watched"
        hint={
          allowlist
            ? 'Approved channels only: nothing else can ever appear. Best for kids.'
            : 'Your channels plus trending videos from the topics below, minus anything you block.'
        }
      >
        <ChipGroup>
          <Chip label="Approved channels only" selected={allowlist} onPress={() => rules({ mode: 'allowlist' })} />
          <Chip label="Channels + trending" selected={!allowlist} onPress={() => rules({ mode: 'open' })} />
        </ChipGroup>
      </Section>

      <Section
        title={allowlist ? `Approved channels (${draft.rules.channels.length})` : `Your channels (${draft.rules.channels.length})`}
        right={
          <Pressable onPress={() => router.push({ pathname: '/channels', params: { profileId: id, list: 'channels' } })} hitSlop={10}>
            <Text style={{ color: c.accent, fontWeight: '600' }}>+ Add</Text>
          </Pressable>
        }
      >
        {draft.rules.channels.length === 0 ? (
          <RowItem
            title="No channels yet"
            subtitle="Tap + Add, then paste a channel link or @handle, or search."
            onPress={() => router.push({ pathname: '/channels', params: { profileId: id, list: 'channels' } })}
            last
          />
        ) : (
          draft.rules.channels.map((cid, i) => channelRow(cid, 'channels', i === draft.rules.channels.length - 1))
        )}
      </Section>

      {!allowlist && (
        <Section title="Trending topics" hint="Popular videos in your country for these topics, filtered by every rule on this page.">
          <ChipGroup>
            {[{ id: TRENDING_ALL, name: categoryName(TRENDING_ALL) }, ...CATEGORIES].map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                selected={draft.rules.trendingCategoryIds.includes(cat.id)}
                onPress={() => rules({ trendingCategoryIds: toggle(draft.rules.trendingCategoryIds, cat.id).slice(0, 10) })}
              />
            ))}
          </ChipGroup>
        </Section>
      )}

      <Section
        title={`Blocked channels (${draft.rules.blockedChannels.length})`}
        hint="Never shown, even in trending."
        right={
          <Pressable onPress={() => router.push({ pathname: '/channels', params: { profileId: id, list: 'blockedChannels' } })} hitSlop={10}>
            <Text style={{ color: c.accent, fontWeight: '600' }}>+ Block</Text>
          </Pressable>
        }
      >
        {draft.rules.blockedChannels.length === 0 ? (
          <RowItem title="None" last />
        ) : (
          draft.rules.blockedChannels.map((cid, i) => channelRow(cid, 'blockedChannels', i === draft.rules.blockedChannels.length - 1))
        )}
      </Section>

      <Section title="Content filters">
        <SwitchRow title="Hide Shorts" subtitle="Vertical videos up to 3 minutes" value={draft.rules.hideShorts} onChange={(hideShorts) => rules({ hideShorts })} />
        <SwitchRow title="Hide live streams" subtitle="Live and upcoming streams can’t be checked in advance" value={draft.rules.hideLive} onChange={(hideLive) => rules({ hideLive })} />
        <SwitchRow
          title="Made for kids only"
          subtitle="Only videos the creator marked as made for kids. They also get YouTube’s restricted, non-personalized ads."
          value={draft.rules.madeForKidsOnly}
          onChange={(madeForKidsOnly) => rules({ madeForKidsOnly })}
          last
        />
      </Section>

      <Section title="Video length" hint="Shorter videos mean fewer mid-roll ads: YouTube only places them in videos over 8 minutes.">
        <Muted style={{ paddingHorizontal: 12, paddingTop: 12 }}>Longest allowed</Muted>
        <ChipGroup>
          {MAX_LENGTHS.map((o) => (
            <Chip key={o.label} label={o.label} selected={draft.rules.maxDurationSec === o.value} onPress={() => rules({ maxDurationSec: o.value })} />
          ))}
        </ChipGroup>
        <Muted style={{ paddingHorizontal: 12 }}>Shortest allowed</Muted>
        <ChipGroup>
          {MIN_LENGTHS.map((o) => (
            <Chip key={o.label} label={o.label} selected={draft.rules.minDurationSec === o.value} onPress={() => rules({ minDurationSec: o.value })} />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Blocked words" hint="Matches titles, descriptions, tags and channel names as whole words. End with * to match word starts, e.g. prank*.">
        <View style={{ flexDirection: 'row', padding: 12, paddingBottom: 4 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Input value={keyword} onChangeText={setKeyword} placeholder="Add a word or phrase" onSubmitEditing={addKeyword} returnKeyType="done" />
          </View>
          <Button title="Add" variant="secondary" onPress={addKeyword} />
        </View>
        <ChipGroup>
          {draft.rules.blockedKeywords.map((k) => (
            <Chip key={k} label={k} onRemove={() => rules({ blockedKeywords: draft.rules.blockedKeywords.filter((x) => x !== k) })} />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Blocked topics">
        <ChipGroup>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={draft.rules.blockedCategoryIds.includes(cat.id)}
              onPress={() => rules({ blockedCategoryIds: toggle(draft.rules.blockedCategoryIds, cat.id) })}
            />
          ))}
        </ChipGroup>
      </Section>

      <Section title="Player">
        <SwitchRow
          title="Privacy-enhanced mode"
          subtitle="Uses youtube-nocookie.com so viewing is less tied to tracking"
          value={draft.player.privacyEnhanced}
          onChange={(privacyEnhanced) => player({ privacyEnhanced })}
        />
        <SwitchRow
          title="Autoplay next video"
          subtitle="Off = each video ends instead of rolling into the next"
          value={draft.player.autoplayNext}
          onChange={(autoplayNext) => player({ autoplayNext })}
        />
        <SwitchRow
          title="“Skip sponsor” button"
          subtitle="Community-marked sponsor segments (SponsorBlock). Never skips automatically. YouTube ads are not affected."
          value={draft.player.sponsorSkip === 'button'}
          onChange={(on) => player({ sponsorSkip: on ? 'button' : 'off' })}
          last
        />
      </Section>

      <Button title={dirty ? 'Save changes' : 'Saved'} onPress={save} loading={saving} disabled={!dirty} />
      <View style={{ height: 12 }} />
      <Button title="Preview what the TV shows" variant="secondary" onPress={() => router.push(`/preview/${id}`)} disabled={dirty} />
      {dirty ? <Muted style={{ textAlign: 'center', marginTop: 6 }}>Save first to preview.</Muted> : null}
      <View style={{ height: 24 }} />
      <Button title="Delete profile" variant="danger" onPress={remove} />
    </Screen>
  );
}
