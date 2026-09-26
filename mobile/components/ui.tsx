// Shared UI building blocks. Large touch targets: the demo happens on a phone in a loud room.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View as RNView, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export function useColors() {
  return Colors[useColorScheme()];
}

export function Card({ children, style, highlight }: { children: ReactNode; style?: ViewStyle; highlight?: boolean }) {
  const c = useColors();
  return (
    <RNView
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: highlight ? c.tint : c.border, borderWidth: highlight ? 2 : 1 },
        style,
      ]}>
      {children}
    </RNView>
  );
}

const AVATAR_HUES = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6'];

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hue = AVATAR_HUES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_HUES.length];
  return (
    <RNView style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: hue }]}>
      <RNText style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials || '?'}</RNText>
    </RNView>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'tint' | 'ai' | 'success' }) {
  const c = useColors();
  const bg = { neutral: c.surfaceAlt, tint: c.tintSoft, ai: c.aiSoft, success: c.successSoft }[tone];
  const fg = { neutral: c.text, tint: c.tint, ai: c.ai, success: c.success }[tone];
  return (
    <RNView style={[styles.chip, { backgroundColor: bg }]}>
      <RNText style={[styles.chipText, { color: fg }]}>{label}</RNText>
    </RNView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = { primary: c.tint, secondary: c.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: c.onTint, secondary: c.text, ghost: c.tint, danger: c.danger }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'danger' && { borderWidth: 1.5, borderColor: c.danger },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={[styles.buttonText, { color: fg }]}>{label}</RNText>}
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <RNView style={styles.sectionRow}>
      <RNText style={[styles.section, { color: c.muted }]}>{children}</RNText>
      {right}
    </RNView>
  );
}

/** Small "AI" label for anything generated or ranked by the model. */
export function AiBadge({ label = 'AI' }: { label?: string }) {
  const c = useColors();
  return (
    <RNView style={[styles.aiBadge, { backgroundColor: c.aiSoft }]}>
      <RNText style={[styles.aiBadgeText, { color: c.ai }]}>✦ {label}</RNText>
    </RNView>
  );
}

export function MatchMeter({ score }: { score: number }) {
  const c = useColors();
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return (
    <RNView style={styles.meterWrap}>
      <RNView style={[styles.meterTrack, { backgroundColor: c.surfaceAlt }]}>
        <RNView style={[styles.meterFill, { width: `${pct}%`, backgroundColor: c.tint }]} />
      </RNView>
      <RNText style={[styles.meterText, { color: c.muted }]}>{pct}% match</RNText>
    </RNView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, gap: 10 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 14, fontWeight: '600' },
  button: { minHeight: 52, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  aiBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  aiBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  meterWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meterTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4 },
  meterText: { fontSize: 13, fontWeight: '600', minWidth: 78, textAlign: 'right' },
});
