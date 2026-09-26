import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Card, SectionTitle, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// Feed insights (AR7, MASTER_SPEC 3.11): what your connections have been up to. Aggregate, private to you.
export default function InsightsScreen() {
  const c = useColors();
  const [days, setDays] = useState<7 | 30>(7);
  const { state, reload } = useAsync(() => api.feedInsights(days), [days]);

  const Range = (
    <View style={[styles.seg, { backgroundColor: c.surfaceAlt }]}>
      {([7, 30] as const).map((n) => (
        <Pressable key={n} onPress={() => setDays(n)} accessibilityRole="button" accessibilityState={{ selected: days === n }}
          style={[styles.segItem, days === n && { backgroundColor: c.surface }]}>
          <Text style={[styles.segText, { color: days === n ? c.text : c.muted }]}>Last {n} days</Text>
        </Pressable>
      ))}
    </View>
  );

  if (state.status === 'loading') return <View style={[styles.container, { flex: 1, backgroundColor: c.background }]}>{Range}<Loading label="Reading your feed…" /></View>;
  if (state.status === 'error') return <View style={[styles.container, { flex: 1, backgroundColor: c.background }]}>{Range}<ErrorState message={state.message} onRetry={reload} /></View>;
  const d = state.data;
  const total = d.activity.reduce((a, x) => a + x.count, 0);
  const busiest = d.activity.reduce((a, x) => (x.count > a.count ? x : a), { date: '', count: 0 });
  const max = Math.max(1, ...d.activity.map((x) => x.count));
  const maxTopic = Math.max(1, ...d.trending_topics.map((t) => t.count));
  const compact = d.activity.length > 10;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {Range}
      <Card>
        <Text style={[styles.big, { color: c.text }]}>{total}</Text>
        <Text style={[styles.h2, { color: c.text }]}>updates from your connections</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          {total === 0
            ? 'Quiet so far. Updates appear when your connections post or push code to GitHub.'
            : `${d.by_kind.github} from GitHub, ${d.by_kind.post} posts, ${d.by_kind.update} updates.${busiest.count ? ` Busiest day: ${dayName(busiest.date)}.` : ''}`}
        </Text>
      </Card>

      <SectionTitle>Activity by day</SectionTitle>
      <Card>
        <View style={styles.bars}>
          {d.activity.map((x) => (
            <View key={x.date} style={styles.barCol}>
              {!compact && <Text style={[styles.barVal, { color: x.count ? c.text : 'transparent' }]}>{x.count}</Text>}
              <View style={styles.barTrack}>
                <View style={{ height: `${(x.count / max) * 100}%`, minHeight: 3, borderRadius: 4, backgroundColor: x.count ? c.tint : c.surfaceAlt }} />
              </View>
              {!compact && <Text style={[styles.small, { color: c.muted }]}>{dayShort(x.date)}</Text>}
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle>Trending in your network</SectionTitle>
      <Card>
        {d.trending_topics.length === 0 ? (
          <Text style={[styles.body, { color: c.muted }]}>Nothing trending yet.</Text>
        ) : (
          d.trending_topics.slice(0, 8).map((t) => (
            <View key={t.name} style={styles.topicRow}>
              <View style={styles.topicHead}>
                <Text style={[styles.topicName, { color: c.text }]} numberOfLines={1}>{t.name}</Text>
                <Text style={[styles.topicN, { color: c.muted }]}>{t.count} mention{t.count === 1 ? '' : 's'}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
                <View style={[styles.fill, { width: `${(t.count / maxTopic) * 100}%`, backgroundColor: c.tint }]} />
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'long' });
const dayShort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' });

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '700' },
  big: { fontSize: 56, fontWeight: '800', letterSpacing: -1, lineHeight: 60 },
  h2: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 12, lineHeight: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 130 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barVal: { fontSize: 11, fontWeight: '700' },
  barTrack: { width: '100%', height: 84, justifyContent: 'flex-end' },
  topicRow: { gap: 5, marginTop: 4 },
  topicHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  topicName: { fontSize: 15, fontWeight: '600', flex: 1 },
  topicN: { fontSize: 14, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
});
