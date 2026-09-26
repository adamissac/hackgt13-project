import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, MatchMeter, SectionTitle, useColors } from '@/components/ui';
import { buildView, placeOnRings, whySentence, type Person } from '@/features/graph/model';
import { RingGraph } from '@/features/graph/RingGraph';
import { api, type GraphMode, type GraphResponse } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { useAsync } from '@/lib/useAsync';

// Connection Graph (MASTER_SPEC 3.12), native. Built by Arjun (AR4/AR5/AD9) to answer one question:
// "who should I meet, and why?" You are in the middle; closer = stronger match.
// Tap a topic to see who shares it, tap a person to see why you matched.

const EXPLAIN: Record<GraphMode, string> = {
  matches: 'People at HackGT 13 you should meet. The closer someone is to you, the stronger the match.',
  network: 'People you’ve connected with. The closer someone is, the more you have in common.',
};

function merge(a: GraphResponse, b: GraphResponse): GraphResponse {
  const nodes = new Map(a.nodes.map((n) => [n.id, n]));
  b.nodes.forEach((n) => nodes.set(n.id, { ...nodes.get(n.id), ...n } as typeof n));
  const key = (e: GraphResponse['edges'][number]) => `${e.source}|${e.target}|${e.kind}`;
  const edges = new Map(a.edges.map((e) => [key(e), e]));
  b.edges.forEach((e) => edges.set(key(e), e));
  // never an edge between two people (MASTER_SPEC 3.12)
  const people = new Set([...nodes.values()].filter((n) => n.type === 'person').map((n) => n.id));
  return { ...a, nodes: [...nodes.values()], edges: [...edges.values()].filter((e) => !(people.has(e.source) && people.has(e.target))) };
}

export default function GraphScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 420);
  const [mode, setMode] = useState<GraphMode>('matches');
  const { state, reload } = useAsync(() => api.graph(mode, HACKGT_EVENT_ID), [mode]);
  const [extra, setExtra] = useState<{ mode: GraphMode; data: GraphResponse } | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const graph = state.status === 'ready' ? (extra?.mode === mode ? merge(state.data, extra.data) : state.data) : null;
  const view = useMemo(() => (graph ? buildView(graph) : null), [graph]);
  const layout = useMemo(() => (view ? placeOnRings(view.people, size, mode) : null), [view, size, mode]);
  const selected = view?.people.find((p) => p.id === selectedId) ?? null;
  const topicObj = view?.topics.find((t) => t.label === topic) ?? null;
  const focus = useMemo(() => {
    if (selected) return new Set([selected.id]);
    if (topic && view) return new Set(view.people.filter((p) => p.shared.includes(topic)).map((p) => p.id));
    return null;
  }, [selected, topic, view]);

  const switchMode = (m: GraphMode) => {
    setMode(m);
    setTopic(null);
    setSelectedId(null);
    setNote(null);
  };

  const findMore = async () => {
    if (!topicObj || !graph) return;
    setExpanding(true);
    setNote(null);
    try {
      const add = await api.graphExpand(topicObj.id, mode, HACKGT_EVENT_ID);
      const before = new Set(graph.nodes.map((n) => n.id));
      const n = add.nodes.filter((x) => x.type === 'person' && !before.has(x.id)).length;
      setExtra({ mode, data: extra?.mode === mode ? merge(extra.data, add) : add });
      setNote(n ? `Found ${n} more ${n === 1 ? 'person' : 'people'} into ${topicObj.label}.` : `No one else here is into ${topicObj.label} yet.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Couldn’t search right now.');
    } finally {
      setExpanding(false);
    }
  };

  const Segmented = (
    <View style={[styles.seg, { backgroundColor: c.surfaceAlt }]} accessibilityRole="tablist">
      {(['matches', 'network'] as const).map((m) => (
        <Pressable
          key={m}
          onPress={() => switchMode(m)}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === m }}
          style={[styles.segItem, mode === m && { backgroundColor: c.surface }]}>
          <Text style={[styles.segText, { color: mode === m ? c.text : c.muted }]}>{m === 'matches' ? 'Who to meet' : 'My network'}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (state.status === 'loading') return <View style={[styles.fill, { backgroundColor: c.background }]}>{Segmented}<Loading label="Finding your people…" /></View>;
  if (state.status === 'error') return <View style={[styles.fill, { backgroundColor: c.background }]}>{Segmented}<ErrorState message={state.message} onRetry={reload} /></View>;
  if (!view || !layout) return null;

  const empty = view.people.length === 0;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {Segmented}
      <Text style={[styles.explain, { color: c.muted }]}>{EXPLAIN[mode]}</Text>

      {empty ? (
        <Card>
          <Text style={[styles.cardTitle, { color: c.text }]}>{mode === 'matches' ? 'No matches yet' : 'No connections yet'}</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            {mode === 'matches'
              ? 'Check in to HackGT 13 and add your GitHub or resume on the Profile tab. Your matches show up here.'
              : 'After you talk to someone, scan each other’s QR code and both say yes. They’ll show up here.'}
          </Text>
        </Card>
      ) : (
        <>
          {view.topics.length > 0 && (
            <View>
              <Text style={[styles.label, { color: c.muted }]}>Tap a topic to see who shares it with you</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {view.topics.map((t) => {
                  const on = topic === t.label;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => {
                        setSelectedId(null);
                        setNote(null);
                        setTopic(on ? null : t.label);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.topic, { backgroundColor: on ? c.tint : c.surface, borderColor: on ? c.tint : c.border }]}>
                      <Text style={[styles.topicText, { color: on ? c.onTint : c.text }]}>
                        {t.label} <Text style={{ color: on ? c.onTint : c.muted }}>· {t.count}</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={[styles.chartCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <RingGraph
              size={size}
              placed={layout.placed}
              radii={layout.radii}
              mode={mode}
              focus={focus}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setNote(null);
              }}
            />
            <View style={styles.key}>
              {mode === 'matches' && <KeyItem swatch={<View style={[styles.keyRing, { borderColor: c.success }]} />} label="Top match" />}
              <KeyItem swatch={<View style={[styles.keyDot, { backgroundColor: c.text }]} />} label="Student" />
              <KeyItem swatch={<View style={[styles.keyDot, { backgroundColor: c.ai }]} />} label="Recruiter" />
            </View>
            {layout.hidden > 0 && (
              <Text style={[styles.small, { color: c.muted }]}>Showing the closest {layout.placed.length}. Everyone is in the list below.</Text>
            )}
          </View>

          {selected ? (
            <PersonCard p={selected} mode={mode} onClose={() => setSelectedId(null)} />
          ) : topicObj ? (
            <Card>
              <Text style={[styles.cardTitle, { color: c.text }]}>{topicObj.label}</Text>
              <Text style={[styles.body, { color: c.muted }]}>
                {topicObj.count} {topicObj.count === 1 ? 'person' : 'people'} {mode === 'matches' ? 'here' : 'in your network'} share this with you.
                They’re connected to you by a line.
              </Text>
              {mode === 'matches' && <Button label={`Find more people into ${topicObj.label}`} variant="secondary" onPress={findMore} loading={expanding} />}
              {note && <Text style={[styles.small, { color: c.muted }]}>{note}</Text>}
            </Card>
          ) : null}

          <SectionTitle>{mode === 'matches' ? 'Everyone, best match first' : 'Your connections'}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {view.people
              .filter((p) => !topic || p.shared.includes(topic))
              .map((p, i, arr) => (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedId(p.id)}
                  accessibilityRole="button"
                  style={[styles.row, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                  <Avatar name={p.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: c.text }]}>
                      {p.name}
                      {p.top ? <Text style={{ color: c.success }}>  ● top</Text> : null}
                    </Text>
                    <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
                      {p.shared.slice(0, 2).join(' · ') || 'Profiles overlap'}
                    </Text>
                  </View>
                  <Text style={[styles.rowRight, { color: c.muted }]}>
                    {mode === 'network' && p.metAt
                      ? new Date(p.metAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      : `${Math.round(p.score * 100)}%`}
                  </Text>
                </Pressable>
              ))}
          </Card>
          {view.synthetic && <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>Showing sample people for the demo.</Text>}
        </>
      )}
    </ScrollView>
  );
}

function KeyItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  const c = useColors();
  return (
    <View style={styles.keyItem}>
      {swatch}
      <Text style={[styles.small, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

function PersonCard({ p, mode, onClose }: { p: Person; mode: GraphMode; onClose: () => void }) {
  const c = useColors();
  return (
    <Card highlight>
      <View style={styles.personHead}>
        <Avatar name={p.name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{p.name}</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {p.role === 'recruiter' ? 'Recruiter' : 'Student'}
            {p.openToMeet ? ' · Open to meet now' : ''}
            {mode === 'network' && p.howMet ? ` · met ${p.howMet === 'invite' ? 'by invite' : 'in person'}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12}>
          <Text style={[styles.close, { color: c.muted }]}>✕</Text>
        </Pressable>
      </View>
      {mode === 'matches' && <MatchMeter score={p.score} />}
      <Text style={[styles.body, { color: c.text }]}>{whySentence(p)}</Text>
      <View style={styles.chipsWrap}>
        {p.shared.slice(0, 5).map((t) => (
          <Chip key={t} label={t} tone="tint" />
        ))}
      </View>
      {mode === 'matches' && <Button label="See profile + icebreakers" onPress={() => router.push(`/match/${p.userId}`)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: 16, gap: 12 },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '700' },
  explain: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chips: { gap: 8, paddingRight: 16 },
  topic: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  topicText: { fontSize: 14, fontWeight: '600' },
  chartCard: { borderRadius: 18, borderWidth: 1, alignItems: 'center', paddingVertical: 8, gap: 6 },
  key: { flexDirection: 'row', gap: 16, paddingHorizontal: 12, paddingBottom: 6, flexWrap: 'wrap', justifyContent: 'center' },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  keyDot: { width: 12, height: 12, borderRadius: 6 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { fontSize: 20, fontWeight: '600', padding: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowRight: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
