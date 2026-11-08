import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

export const palette = {
  light: { bg: '#F5F6FA', card: '#FFFFFF', text: '#11131A', muted: '#6B7385', border: '#E3E6EE', accent: '#5B6CFF', danger: '#E5484D', chip: '#EEF0F7' },
  dark: { bg: '#0B0D12', card: '#161A23', text: '#F4F6FB', muted: '#9AA3B5', border: '#262B38', accent: '#7C8CFF', danger: '#FF6B6B', chip: '#1F2430' },
};

export function useColors() {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: c.bg }]}>{children}</View>;
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.muted }]}>{title.toUpperCase()}</Text>
        {right}
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>{children}</View>
      {hint ? <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function RowItem(props: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void; last?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!props.onPress}
      style={({ pressed }) => [styles.row, !props.last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.6 }]}
    >
      {props.left}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={[styles.rowSubtitle, { color: c.muted }]} numberOfLines={2}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.right}
    </Pressable>
  );
}

export function SwitchRow(props: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const c = useColors();
  return (
    <RowItem
      title={props.title}
      subtitle={props.subtitle}
      last={props.last}
      right={<Switch value={props.value} onValueChange={props.onChange} trackColor={{ true: c.accent, false: c.border }} />}
    />
  );
}

export function Button(props: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const c = useColors();
  const variant = props.variant ?? 'primary';
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? 'transparent' : c.chip;
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: props.disabled ? 0.5 : pressed ? 0.8 : 1 }, props.style]}
    >
      {props.loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{props.title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, onRemove }: { label: string; selected?: boolean; onPress?: () => void; onRemove?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress ?? onRemove}
      style={[styles.chip, { backgroundColor: selected ? c.accent : c.chip }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={{ color: selected ? '#FFF' : c.text, fontWeight: '500' }}>
        {label}
        {onRemove ? '  ✕' : ''}
      </Text>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.chipGroup}>{children}</View>;
}

export function Input(props: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }, props.style]}
    />
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>{children}</Text>;
}

export function Avatar({ emoji, color, size = 40 }: { emoji: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={[styles.screen, { backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  const c = useColors();
  if (!error) return null;
  return <Text style={{ color: c.danger, marginVertical: 8 }}>{error}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  hint: { fontSize: 13, marginTop: 6, paddingHorizontal: 4, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, minHeight: 52 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8 },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, paddingBottom: 4 },
  input: { height: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
});
