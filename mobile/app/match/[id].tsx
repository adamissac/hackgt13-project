import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Card, Chip, Disclosure, MatchMeter, SectionTitle, useColors } from '@/components/ui';
import { api, type Facet } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

const FACETS: { key: Facet; label: string }[] = [
  { key: 'technical', label: 'Technical' },
  { key: 'career', label: 'Career' },
  { key: 'academic', label: 'Academic' },
  { key: 'personal', label: 'Personal' },
];

// Quick profile for a current match (api.md 15) plus AI conversation starters (api.md 7).
// Only shared topics are shown, never the other person's full interest list.
export default function MatchScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAsync(() => api.quickProfile(id), [id]);
  const starters = useAsync(() => api.starters(id), [id]);

  if (profile.state.status === 'loading') return <Loading label="Loading profile…" />;
  if (profile.state.status === 'error') return <ErrorState message={profile.state.message} onRetry={profile.reload} />;
  const p = profile.state.data;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: p.name }} />

      <View style={styles.header}>
        <Avatar name={p.name} size={84} />
        <Text style={[styles.name, { color: c.text }]}>{p.name}</Text>
        <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>
          {p.headline || (p.role === 'recruiter' ? 'Recruiter' : 'Student')}
        </Text>
      </View>

      <Card>
        <AiBadge label="AI conversation starters" />
        {starters.state.status === 'loading' && <Text style={[styles.body, { color: c.muted }]}>Thinking…</Text>}
        {starters.state.status === 'error' && (
          <Text style={[styles.body, { color: c.muted }]}>Couldn’t load suggestions right now.</Text>
        )}
        {starters.state.status === 'ready' && (
          <>
            <Text style={[styles.why, { color: c.text }]}>{starters.state.data.why}</Text>
            {starters.state.data.openers.map((o) => (
              <View key={o} style={[styles.opener, { backgroundColor: c.aiSoft }]}>
                <Text style={[styles.body, { color: c.text }]}>“{o}”</Text>
              </View>
            ))}
          </>
        )}
      </Card>

      <SectionTitle>What you have in common</SectionTitle>
      <Card>
        {p.shared_topics.length === 0 ? (
          <Text style={[styles.body, { color: c.muted }]}>No shared topics yet.</Text>
        ) : (
          p.shared_topics.map((t) => (
            <View key={t.interest_id} style={styles.topic}>
              <Chip label={t.name} tone="ai" />
              {!!t.evidence && <Text style={[styles.small, { color: c.muted }]}>{t.evidence}</Text>}
            </View>
          ))
        )}
      </Card>

      <Disclosure title="Why you matched" subtitle="Match strength and shared interests by area">
        <MatchMeter score={p.score} />
        {FACETS.map((f) => {
          const v = Math.max(0, Math.min(1, p.facet_overlap[f.key] ?? 0));
          return (
            <View key={f.key} style={styles.facetRow}>
              <Text style={[styles.facetLabel, { color: c.text }]}>{f.label}</Text>
              <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
                <View style={[styles.fill, { width: `${Math.round(v * 100)}%`, backgroundColor: c.tint }]} />
              </View>
              <Text style={[styles.facetValue, { color: c.muted }]}>{Math.round(v * 100)}%</Text>
            </View>
          );
        })}
      </Disclosure>

      {(!!p.seeking || !!p.offering) && (
        <>
          <SectionTitle>Looking for · Can offer</SectionTitle>
          <Card>
            {!!p.seeking && (
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ fontWeight: '700' }}>Looking for: </Text>
                {p.seeking}
              </Text>
            )}
            {!!p.offering && (
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ fontWeight: '700' }}>Can offer: </Text>
                {p.offering}
              </Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  name: { fontSize: 30, fontWeight: '500', letterSpacing: -0.8 },
  why: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  opener: { borderRadius: 12, padding: 12 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  topic: { gap: 6, alignItems: 'flex-start' },
  facetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  facetLabel: { width: 82, fontSize: 15, fontWeight: '600' },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  facetValue: { width: 44, textAlign: 'right', fontSize: 13, fontWeight: '600' },
});
