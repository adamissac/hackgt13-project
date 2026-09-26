import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Card, SectionTitle, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// Your network (AR7, MASTER_SPEC 3.11): private to you. Says it in words first, then shows it.
export default function NetworkScreen() {
  const c = useColors();
  const { state, reload } = useAsync(() => api.meDashboard(30), []);
  if (state.status === 'loading') return <Loading label="Loading your network…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  const d = state.data;

  if (d.total === 0) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, flex: 1 }]}>
        <Card>
          <Text style={[styles.h1, { color: c.text }]}>No connections yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            Talk to someone at an event, scan each other’s QR code, and both say yes. Or invite someone you already know from your Profile.
          </Text>
        </Card>
      </View>
    );
  }

  // new connections per day, last 14 days (from the cumulative series)
  const daily = d.growth.map((g, i) => ({ date: g.date, n: i === 0 ? 0 : g.total - d.growth[i - 1].total })).slice(-14);
  const lastWeek = daily.slice(-7).reduce((a, x) => a + x.n, 0);
  const maxDay = Math.max(1, ...daily.map((x) => x.n));
  const inPersonPct = d.total ? d.how_met.in_person / d.total : 0;
  const topics = [...d.top_topics].sort((a, b) => b.connections - a.connections || b.talked - a.talked).slice(0, 6);
  const maxTopic = Math.max(1, ...topics.map((t) => t.connections));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.private, { color: c.muted }]}>Only you can see this page.</Text>

      <Card>
        <Text style={[styles.big, { color: c.text }]}>{d.total}</Text>
        <Text style={[styles.h2, { color: c.text }]}>{d.total === 1 ? 'person' : 'people'} you’ve really connected with</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          {lastWeek > 0 ? `${lastWeek} new in the last 7 days.` : 'No new connections this week.'}
        </Text>
      </Card>

      <SectionTitle>How you met</SectionTitle>
      <Card>
        <Text style={[styles.body, { color: c.text }]}>
          <Text style={styles.bold}>{d.how_met.in_person}</Text> in person, <Text style={styles.bold}>{d.how_met.invite}</Text> through a private invite.
        </Text>
        <View style={[styles.split, { backgroundColor: c.surfaceAlt }]} accessibilityLabel={`${Math.round(inPersonPct * 100)} percent in person`}>
          <View style={{ flex: inPersonPct || 0.0001, backgroundColor: c.tint }} />
          <View style={{ flex: 1 - inPersonPct || 0.0001, backgroundColor: c.ai }} />
        </View>
        <View style={styles.legend}>
          <Legend color={c.tint} label={`In person · ${Math.round(inPersonPct * 100)}%`} />
          <Legend color={c.ai} label={`Invite · ${Math.round((1 - inPersonPct) * 100)}%`} />
        </View>
      </Card>

      <SectionTitle>New connections, last 2 weeks</SectionTitle>
      <Card>
        <View style={styles.bars} accessibilityLabel="New connections per day">
          {daily.map((x) => (
            <View key={x.date} style={styles.barCol}>
              <Text style={[styles.barVal, { color: x.n ? c.text : 'transparent' }]}>{x.n}</Text>
              <View style={[styles.barTrack]}>
                <View style={{ height: `${(x.n / maxDay) * 100}%`, backgroundColor: x.n ? c.tint : c.surfaceAlt, borderRadius: 4, minHeight: 3 }} />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.axis}>
          <Text style={[styles.small, { color: c.muted }]}>{fmt(daily[0]?.date)}</Text>
          <Text style={[styles.small, { color: c.muted }]}>Today</Text>
        </View>
      </Card>

      {topics.length > 0 && (
        <>
          <SectionTitle>What you connect over</SectionTitle>
          <Card>
            <Text style={[styles.small, { color: c.muted }]}>How many of your connections share each interest with you.</Text>
            {topics.map((t) => (
              <View key={t.name} style={styles.topicRow}>
                <View style={styles.topicHead}>
                  <Text style={[styles.topicName, { color: c.text }]} numberOfLines={1}>{t.name}</Text>
                  <Text style={[styles.topicN, { color: c.text }]}>{t.connections}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
                  <View style={[styles.fill, { width: `${(t.connections / maxTopic) * 100}%`, backgroundColor: c.tint }]} />
                </View>
                {t.talked > 0 && (
                  <Text style={[styles.small, { color: c.muted }]}>You talked about it in {t.talked} conversation{t.talked === 1 ? '' : 's'}</Text>
                )}
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const fmt = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

function Legend({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.small, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  private: { fontSize: 13, textAlign: 'center' },
  big: { fontSize: 56, fontWeight: '800', letterSpacing: -1, lineHeight: 60 },
  h1: { fontSize: 20, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  split: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barVal: { fontSize: 11, fontWeight: '700' },
  barTrack: { width: '100%', height: 90, justifyContent: 'flex-end' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  topicRow: { gap: 5, marginTop: 4 },
  topicHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  topicName: { fontSize: 15, fontWeight: '600', flex: 1 },
  topicN: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
});
