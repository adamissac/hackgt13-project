import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/components/ui';

import { STEPS, stepIndex, type RelationshipStage } from './stage';

/** Want to meet → Both said yes → Talked in person → Connected. */
export function StageTracker({ stage }: { stage: RelationshipStage }) {
  const c = useColors();
  const reached = stepIndex(stage);
  return (
    <View style={styles.row} accessibilityLabel={`Progress: ${reached >= 0 ? STEPS[reached].label : 'not started'}`}>
      {STEPS.map((s, i) => {
        const done = i <= reached;
        return (
          <View key={s.key} style={styles.step}>
            <View style={styles.lineRow}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : i <= reached ? c.tint : c.border }]} />
              <View style={[styles.dot, { backgroundColor: done ? c.tint : c.surface, borderColor: done ? c.tint : c.border }]}>
                {done && <Text style={[styles.check, { color: c.onTint }]}>✓</Text>}
              </View>
              <View
                style={[styles.line, { backgroundColor: i === STEPS.length - 1 ? 'transparent' : i < reached ? c.tint : c.border }]}
              />
            </View>
            <Text style={[styles.label, { color: done ? c.text : c.muted, fontWeight: done ? '700' : '500' }]}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 12, fontWeight: '900' },
  label: { fontSize: 11, textAlign: 'center' },
});
