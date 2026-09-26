// What you see when you tap someone on the Graph (Arjun). A small profile, not just a score:
// who they are, what they're into, and, for connections, how you met and what you last talked about.
// Data: GET /matches/{id}/quick-profile (api.md 15) and GET /connections/{id} (api.md 24).
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, Chip, MatchMeter, useColors } from '@/components/ui';
import { api, type GraphMode } from '@/lib/api';
import { env } from '@/lib/env';
import { useAsync } from '@/lib/useAsync';

import { whySentence, type Person } from './model';

interface Detail {
  headline: string;
  seeking: string;
  offering: string;
  interests: { name: string; evidence: string }[];
  connection: { metAt: string; when: string | null; howMet: string; minutes: number | null; talkedAbout: string[] } | null;
}

async function load(p: Person, mode: GraphMode): Promise<Detail> {
  if (env.useMocks) {
    // Sample data: the mock endpoints return one fixed person, so build the sheet from the graph's own data.
    return {
      headline: p.role === 'recruiter' ? `Recruiting for ${p.shared[0] ?? 'tech'} roles` : `Student into ${p.shared.slice(0, 2).join(' and ')}`,
      seeking: p.role === 'recruiter' ? `Students with ${p.shared[0] ?? 'ML'} experience` : `Internships and collaborators in ${p.shared[0] ?? 'tech'}`,
      offering: p.role === 'recruiter' ? 'Internship and new grad roles' : `Projects in ${p.shared.slice(0, 2).join(', ')}`,
      interests: p.shared.map((name) => ({ name, evidence: '' })),
      connection:
        mode === 'network'
          ? { metAt: 'HackGT 13', when: p.metAt, howMet: p.howMet === 'invite' ? 'a private invite' : 'in person', minutes: 12, talkedAbout: p.shared.slice(0, 2) }
          : null,
    };
  }
  const [qp, conn] = await Promise.all([
    api.quickProfile(p.userId).catch(() => null),
    mode === 'network' ? api.connection(p.userId).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    headline: qp?.headline ?? '',
    seeking: qp?.seeking ?? '',
    offering: qp?.offering ?? '',
    interests: qp?.shared_topics.length
      ? qp.shared_topics.map((t) => ({ name: t.name, evidence: t.evidence }))
      : p.shared.map((name) => ({ name, evidence: '' })),
    connection: conn
      ? {
          metAt: conn.met_at,
          when: conn.created_at,
          howMet: p.howMet === 'invite' ? 'a private invite' : 'in person',
          minutes: conn.minutes_talked ?? null,
          talkedAbout: conn.talked_about,
        }
      : null,
  };
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '');

export function PersonSheet({ p, mode, onClose }: { p: Person; mode: GraphMode; onClose: () => void }) {
  const c = useColors();
  const { state } = useAsync(() => load(p, mode), [p.id, mode]);
  const d = state.status === 'ready' ? state.data : null;

  return (
    <Card highlight>
      <View style={styles.head}>
        <Avatar name={p.name} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.text }]}>{p.name}</Text>
          <Text style={[styles.small, { color: c.muted }]} numberOfLines={2}>
            {p.role === 'recruiter' ? 'Recruiter' : 'Student'}
            {d?.headline ? ` · ${d.headline}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12}>
          <Text style={[styles.close, { color: c.muted }]}>✕</Text>
        </Pressable>
      </View>

      {mode === 'matches' ? (
        <>
          <MatchMeter score={p.score} />
          <Text style={[styles.body, { color: c.text }]}>{whySentence(p)}</Text>
        </>
      ) : d?.connection ? (
        <View style={[styles.box, { backgroundColor: c.tintSoft }]}>
          <Text style={[styles.label, { color: c.tint }]}>YOUR CONNECTION</Text>
          <Text style={[styles.body, { color: c.text }]}>
            Met {d.connection.howMet} at {d.connection.metAt}
            {d.connection.when ? ` on ${day(d.connection.when)}` : ''}
            {d.connection.minutes ? `, talked for about ${d.connection.minutes} min` : ''}.
          </Text>
          {d.connection.talkedAbout.length > 0 && (
            <>
              <Text style={[styles.label, { color: c.tint, marginTop: 6 }]}>LAST TALKED ABOUT</Text>
              <View style={styles.chips}>
                {d.connection.talkedAbout.map((t) => (
                  <Chip key={t} label={t} tone="tint" />
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

      {state.status === 'loading' && <Text style={[styles.small, { color: c.muted }]}>Loading their profile…</Text>}

      {d && (
        <>
          <Text style={[styles.label, { color: c.muted }]}>{mode === 'matches' ? 'INTERESTS YOU SHARE' : 'YOU CONNECT OVER'}</Text>
          <View style={{ gap: 8 }}>
            {d.interests.slice(0, 5).map((i) => (
              <View key={i.name} style={styles.interest}>
                <Chip label={i.name} tone="tint" />
                {i.evidence ? (
                  <Text style={[styles.small, { color: c.muted, flex: 1 }]} numberOfLines={2}>
                    {i.evidence}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          {(d.seeking || d.offering) && (
            <View style={{ gap: 6 }}>
              {d.seeking ? <Row label="Looking for" value={d.seeking} /> : null}
              {d.offering ? <Row label="Can offer" value={d.offering} /> : null}
            </View>
          )}
        </>
      )}

      <Button
        label={mode === 'matches' ? 'Full profile + icebreakers' : 'Full profile'}
        variant={mode === 'matches' ? 'primary' : 'secondary'}
        onPress={() => router.push(`/match/${p.userId}`)}
      />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <Text style={[styles.body, { color: c.text }]}>
      <Text style={{ color: c.muted, fontWeight: '700' }}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 20, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  close: { fontSize: 20, fontWeight: '600', padding: 4 },
  box: { borderRadius: 14, padding: 12, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
