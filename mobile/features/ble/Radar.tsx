// AK5 proximity radar (MASTER_SPEC 3.4). Three rings for the distance bands; one dot per nearby
// match. A dot's angle is derived from the user id so it stays put between refreshes: it is NOT a
// direction or position, and nothing here shows meters. Green dots are this viewer's top matches.
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { Text, View, useThemeColor } from '@/components/Themed';

import type { Peer } from './index';
import type { DistanceBand } from './signal';

const BANDS: DistanceBand[] = ['very close', 'nearby', 'farther away'];
const GREEN = '#1faa59';
const GREY = '#8a8f98';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

export function Radar({ peers, onSelect }: { peers: Peer[]; onSelect?: (p: Peer) => void }) {
  const { width } = useWindowDimensions();
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const [selected, setSelected] = useState<Peer | null>(null);
  const size = Math.min(width - 32, 360);
  const c = size / 2;
  const ringR = [c * 0.34, c * 0.66, c * 0.97];
  const dotR = 14; // big touch target: this demos in a loud room

  const place = (p: Peer) => {
    const i = BANDS.indexOf(p.band);
    const inner = i === 0 ? dotR + 6 : ringR[i - 1] + dotR / 2;
    const outer = ringR[i] - dotR / 2;
    const r = inner + (outer - inner) * (0.25 + 0.5 * hash(`${p.user_id}:r`));
    const a = 2 * Math.PI * hash(p.user_id);
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };

  const pick = (p: Peer) => {
    setSelected(p);
    onSelect?.(p);
  };

  const current = selected && peers.find((p) => p.user_id === selected.user_id);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} accessibilityLabel={`Radar with ${peers.length} people nearby`}>
        {[...ringR].reverse().map((r, i) => (
          <Circle key={r} cx={c} cy={c} r={r} stroke={GREY} strokeOpacity={0.5} strokeWidth={1} fill={tint} fillOpacity={0.03 + i * 0.03} />
        ))}
        {BANDS.map((b, i) => (
          <SvgText key={b} x={c} y={c - ringR[i] + 14} fill={text} opacity={0.5} fontSize={11} textAnchor="middle">
            {b}
          </SvgText>
        ))}
        <Circle cx={c} cy={c} r={6} fill={tint} />
        {peers.map((p) => {
          const { x, y } = place(p);
          const isSel = current?.user_id === p.user_id;
          return (
            <G key={p.user_id} onPress={() => pick(p)}>
              <Circle cx={x} cy={y} r={dotR} fill={p.highlight ? GREEN : GREY} stroke={isSel ? text : 'none'} strokeWidth={3} />
              <SvgText x={x} y={y + 4} fill="#fff" fontSize={12} fontWeight="bold" textAnchor="middle">
                {p.name.slice(0, 1)}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Accessible list of the same dots (screen readers can't tap SVG shapes reliably). */}
      <View style={styles.legend}>
        {peers.map((p) => (
          <Pressable
            key={p.user_id}
            onPress={() => pick(p)}
            style={[styles.pill, current?.user_id === p.user_id && { borderColor: tint }]}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${p.band}${p.highlight ? ', top match' : ''}`}>
            <View style={[styles.dot, { backgroundColor: p.highlight ? GREEN : GREY }]} />
            <Text style={styles.pillText}>{p.name}</Text>
          </Pressable>
        ))}
      </View>

      {current ? (
        <View style={styles.card}>
          <Text style={styles.name}>{current.name}</Text>
          <Text style={styles.muted}>
            {current.band}
            {current.highlight ? ' · top match for you' : ''}
          </Text>
          {current.why?.length ? <Text style={styles.why}>You both: {current.why.join(', ')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 2, borderColor: '#8884' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontSize: 15 },
  card: { alignSelf: 'stretch', borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 14, gap: 4 },
  name: { fontSize: 18, fontWeight: '600' },
  muted: { fontSize: 14, opacity: 0.65 },
  why: { fontSize: 15 },
});
