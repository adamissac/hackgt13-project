import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { buildView } from '@/features/graph/model';
import { PersonSheet } from '@/features/graph/PersonSheet';
import { Atom, groupByTopic } from '@/features/graph/Atom';
import { useColorScheme } from '@/components/useColorScheme';
import { api, type GraphMode, type GraphResponse } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { useAsync } from '@/lib/useAsync';

// Connection Graph (MASTER_SPEC 3.12), native. Built by Arjun. One job: show the handful of people you
// should talk to next and why. Everyone on the diagram is labeled; topics change who's shown.

const FEATURED = 6;
const LIST_PREVIEW = 5;

const COPY: Record<GraphMode, { title: string; explain: string }> = {
  matches: {
    title: 'A little common ground.',
    explain: 'You’re at the center. Tap a person to find your connection.',
  },
  network: {
    title: 'Your own constellation.',
    explain: 'The people you know, connected through shared interests.',
  },
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
  const size = Math.min(width - 34, 440);
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<GraphMode>('matches');
  const { state, reload } = useAsync(() => api.graph(mode, HACKGT_EVENT_ID), [mode]);
  const [extra, setExtra] = useState<{ mode: GraphMode; data: GraphResponse } | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const graph = state.status === 'ready' ? (extra?.mode === mode ? merge(state.data, extra.data) : state.data) : null;
  const view = useMemo(() => (graph ? buildView(graph) : null), [graph]);
  const pool = useMemo(() => (view ? view.people.filter((p) => !topic || p.shared.includes(topic)) : []), [view, topic]);
  const featured = useMemo(() => pool.slice(0, FEATURED), [pool]);
  const dark = useColorScheme() === 'dark';
  const { groups, colorOf } = useMemo(
    () => groupByTopic(featured, view?.topics.map((t) => t.label) ?? [], dark),
    [featured, view, dark],
  );
  const selected = view?.people.find((p) => p.id === selectedId) ?? null;
  const topicObj = view?.topics.find((t) => t.label === topic) ?? null;

  const reset = () => {
    setSelectedId(null);
    setNote(null);
    setShowAll(false);
  };
  const switchMode = (m: GraphMode) => {
    setMode(m);
    setTopic(null);
    reset();
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
  if (!view) return null;

  const rest = pool.slice(FEATURED);
  const listed = showAll ? rest : rest.slice(0, LIST_PREVIEW);
  const chips = [{ id: '__all', label: 'Everyone', count: view.people.length }, ...view.topics];

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {Segmented}

      {view.people.length === 0 ? (
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
          <View>
            <Text style={[styles.h1, { color: c.text }]}>{topic ? `Top people into ${topic}` : COPY[mode].title}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{COPY[mode].explain}</Text>
          </View>

          {view.topics.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {chips.map((t) => {
                const on = t.id === '__all' ? topic === null : topic === t.label;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      reset();
                      setTopic(t.id === '__all' || on ? null : t.label);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.topic, { backgroundColor: on ? c.tint : c.surface, borderColor: on ? c.tint : c.border }]}>
                    <Text style={[styles.topicText, { color: on ? c.onTint : c.text }]}>
                      {t.label} <Text style={{ color: on ? c.onTint : c.muted }}>{t.count}</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.chartCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.chartHeading}>
              <Text style={[styles.small, { color: c.muted }]}>{mode === 'matches' ? 'Your closest matches' : 'Your connections'}</Text>
              <Pressable onPress={() => setPaused(!paused)} accessibilityRole="button" accessibilityLabel={paused ? 'Resume rotation' : 'Pause rotation'} style={{ minWidth: 64, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{paused ? 'Play ▷' : 'Pause Ⅱ'}</Text>
              </Pressable>
            </View>
            <Atom size={size} people={featured} colorOf={colorOf} selectedId={selectedId} onSelect={setSelectedId} colors={c} paused={paused} />
            <Text style={[styles.howToText, { color: c.muted }]}>Tap a node to explore</Text>
          </View>
          <Disclosure title="Reading your graph" subtitle="Colors show shared interests">
            <View style={styles.legend}>
              {groups.map((g) => (
                <View key={g.label} style={[styles.legendItem, { backgroundColor: c.surfaceAlt }]}>
                  <View style={[styles.legendDot, { backgroundColor: g.color }]} />
                  <Text style={[styles.legendText, { color: c.text }]} numberOfLines={1}>
                    {g.label} <Text style={{ color: c.muted }}>{g.count}</Text>
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.body, { color: c.muted }]}>Stronger, brighter lines mean more shared interests; faint lines mean less overlap. Positions are for readability, not physical distance. Each line connects someone to you, never to another person.</Text>
          </Disclosure>

          {topicObj && mode === 'matches' ? (
            <Card>
              <Text style={[styles.body, { color: c.text }]}>
                {topicObj.count} {topicObj.count === 1 ? 'person' : 'people'} here share {topicObj.label} with you.
              </Text>
              <Button label={`Find more people into ${topicObj.label}`} variant="secondary" onPress={findMore} loading={expanding} />
              {note && <Text style={[styles.small, { color: c.muted }]}>{note}</Text>}
            </Card>
          ) : null}

          {pool.length > FEATURED && (
            <>
              <SectionTitle>{mode === 'matches' ? `More people you could meet (${rest.length})` : `More connections (${rest.length})`}</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {listed.map((p, i) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedId(p.id)}
                    accessibilityRole="button"
                    style={[styles.row, i < listed.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                    <Avatar name={p.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: c.text }]}>{p.name}</Text>
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
                {rest.length > LIST_PREVIEW && (
                  <Pressable onPress={() => setShowAll((s) => !s)} accessibilityRole="button" style={styles.more}>
                    <Text style={[styles.moreText, { color: c.tint }]}>{showAll ? 'Show less' : `Show all ${rest.length}`}</Text>
                  </Pressable>
                )}
              </Card>
            </>
          )}
          {view.synthetic && <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>Showing sample people for the demo.</Text>}
          <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelectedId(null)}>
            <View style={styles.modalBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close profile" onPress={() => setSelectedId(null)} />
              <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.background, paddingBottom: Math.max(insets.bottom, 16), maxHeight: '85%' }]}>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  {selected && <PersonSheet key={selected.id} p={selected} mode={mode} onClose={() => setSelectedId(null)} />}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: 16, gap: 12 },
  container: { padding: 16, gap: 16, paddingBottom: 110, width: '100%', maxWidth: 560, alignSelf: 'center' },
  chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 18, paddingTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '700' },
  h1: { fontSize: 28, fontWeight: '500', letterSpacing: -0.8, marginBottom: 8 },
  chips: { gap: 8, paddingRight: 16 },
  topic: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  topicText: { fontSize: 14, fontWeight: '600' },
  chartCard: { borderRadius: 20, borderWidth: 1, alignItems: 'center', overflow: 'hidden', paddingBottom: 14, gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: '700' },
  scale: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, alignSelf: 'stretch' },
  scaleLabel: { fontSize: 12, fontWeight: '700' },
  scaleBar: { flexDirection: 'row', flex: 1, height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  scaleStep: { flex: 1 },
  howToText: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 14 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { fontSize: 20, fontWeight: '600', padding: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowRight: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 15, fontWeight: '700' },
});
