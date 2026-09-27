import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, SectionTitle, useColors } from './ui';
import { useAppearanceChoice, type AppearanceChoice } from '@/lib/appearance';

const OPTIONS: { value: AppearanceChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Segmented light / dark / system control. "System" is the default and stays reachable, so a
 *  choice is never a one-way door. */
export function AppearancePicker() {
  const c = useColors();
  const [choice, setChoice] = useAppearanceChoice();
  return (
    <>
      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <View
          style={[styles.row, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Appearance">
          {OPTIONS.map(({ value, label }) => {
            const on = choice === value;
            return (
              <Pressable
                key={value}
                onPress={() => setChoice(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
                style={[styles.opt, on && { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.label, { color: on ? c.text : c.muted, fontWeight: on ? '600' : '500' }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: c.muted }]}>
          {choice === 'system' ? 'Following your phone’s setting.' : `Always ${choice}, on this device.`}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 3 },
  // 44pt tall: the demo happens on a phone in a loud room (.claude/rules/mobile.md).
  opt: { flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15 },
  hint: { fontSize: 13, marginTop: 8 },
});
