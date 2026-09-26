import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { atomLayout } from './atomLayout';
import type { Person } from './model';

const LIGHT = ['#467963', '#6579A0', '#AA7253'];
const DARK = ['#A2CFB5', '#A9BCDF', '#DEAC88'];

export function groupByTopic(people: Person[], topicOrder: string[], dark: boolean) {
  const palette = dark ? DARK : LIGHT;
  const rank = new Map(topicOrder.map((t, i) => [t, i]));
  const mainOf = (p: Person) => [...p.shared].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))[0] ?? '';
  const counts = new Map<string, number>();
  people.forEach((p) => mainOf(p) && counts.set(mainOf(p), (counts.get(mainOf(p)) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const colors = new Map(top.map(([t], i) => [t, palette[i]]));
  const groups = top.map(([label, count], i) => ({ label, count, color: palette[i] }));
  const rest = people.filter((p) => !colors.has(mainOf(p))).length;
  const other = dark ? '#B6B5A8' : '#858575';
  if (rest) groups.push({ label: 'Other interests', count: rest, color: other });
  return { groups, colorOf: (p: Person) => colors.get(mainOf(p)) ?? other };
}

// Six anchored people, a nucleus, and connections only to you. Native buttons over
// the SVG provide keyboard/screen-reader access; no moving targets or frame loop.
export function Atom({ size, people, colorOf, selectedId, onSelect, colors }: {
  size: number; people: Person[]; colorOf: (p: Person) => string;
  selectedId: string | null; onSelect: (id: string | null) => void;
  colors: { text: string; muted: string; border: string; surface: string; tint: string; tintSoft: string; onTint: string };
}) {
  const { height, center, nodes } = atomLayout(size, people.length);
  return (
    <View style={{ width: size, height }}>
      <Svg width={size} height={height} style={{ position: 'absolute' }} pointerEvents="none" accessible={false}>
        <Defs><RadialGradient id="nucleusHalo">
          <Stop offset="0" stopColor={colors.tint} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.tint} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx={center.x} cy={center.y} r={size * 0.32} fill="url(#nucleusHalo)" />
        {[-35, 35].map((angle) => (
          <Ellipse key={angle} cx={center.x} cy={center.y} rx={size * 0.37} ry={size * 0.2}
            rotation={angle} origin={`${center.x}, ${center.y}`} fill="none" stroke={colors.tint} strokeOpacity={0.12} strokeWidth={1} />
        ))}
        {nodes.map((n, i) => {
          const p = people[i];
          const score = Math.max(0, Math.min(1, p.score));
          const dx = n.x - center.x, dy = n.y - center.y;
          const bend = i % 2 ? 0.17 : -0.17;
          return <Path key={p.id} d={`M ${center.x} ${center.y} Q ${center.x + dx * 0.5 - dy * bend} ${center.y + dy * 0.5 + dx * bend} ${n.x} ${n.y}`}
            fill="none" stroke={colorOf(p)} strokeWidth={1 + score * 2} strokeOpacity={selectedId === p.id ? 0.9 : 0.35} />;
        })}
        {[[0, -9], [-10, 5], [10, 5]].map(([x, y], i) => (
          <Circle key={i} cx={center.x + x} cy={center.y + y} r={25} fill={colors.tint} opacity={0.15} />
        ))}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', left: center.x - 31, top: center.y - 31, width: 62, height: 62, borderRadius: 31, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.tintSoft }}>
        <Text style={{ color: colors.onTint, fontSize: 16, fontWeight: '600' }}>You</Text>
      </View>
      {nodes.map((n, i) => {
        const p = people[i];
        const selected = selectedId === p.id;
        return (
          <Pressable key={p.id} onPress={() => onSelect(selected ? null : p.id)} accessibilityRole="button"
            accessibilityLabel={`View ${p.name}, ${p.shared[0] ?? 'shared interests'}`} accessibilityState={{ selected }}
            style={({ pressed }) => ({ position: 'absolute', left: n.x - 45, top: n.y - 24, width: 90, minHeight: 76, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: selected ? 3 : 2, borderColor: colorOf(p), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colorOf(p), fontSize: 16, fontWeight: '600' }}>{(p.name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('')}</Text>
            </View>
            <Text numberOfLines={1} style={{ maxWidth: 90, color: colors.text, fontSize: 13, fontWeight: '600', backgroundColor: colors.surface, paddingHorizontal: 4 }}>{p.first}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
