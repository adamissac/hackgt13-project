import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { atomLayout } from './atomLayout';
import type { Person } from './model';

import { FACET_COLORS } from '@/constants/Colors';
const LABELS = { technical: 'Technology', career: 'Career & entrepreneurship', personal: 'Personal interests', academic: 'Academics' };
export function groupByTopic(people: Person[], _topicOrder: string[], _dark: boolean) {
 const groups = Object.entries(FACET_COLORS).map(([facet, color]) => ({ label: LABELS[facet as keyof typeof LABELS], color, count: people.filter(p => p.facet === facet).length })).filter(g => g.count > 0);
 const other = people.filter(p => !p.facet).length;
 if (other) groups.push({label:'Other interests', color:'#78859A', count:other});
 return {groups, colorOf: (p: Person) => p.facet ? FACET_COLORS[p.facet] : '#78859A'};
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
      <Svg width={size} height={height} style={{ position: 'absolute' }} pointerEvents="none">
        <Defs><RadialGradient id="nucleusHalo">
          <Stop offset="0" stopColor={colors.tint} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.tint} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx={center.x} cy={center.y} r={size * 0.32} fill="url(#nucleusHalo)" />
        {Array.from({length: 22}, (_, i) => <Circle key={`star-${i}`} cx={12 + ((i * 83) % (size - 24))} cy={14 + ((i * 67) % (height - 28))} r={i % 4 === 0 ? 1.7 : 0.8} fill={colors.tint} opacity={0.12} />)}
        {nodes.map((n, i) => {
          const p = people[i];
          const score = Math.max(0, Math.min(1, p.score));
          return <Path key={p.id} d={`M ${center.x} ${center.y} L ${n.x} ${n.y}`}
            fill="none" stroke={colorOf(p)} strokeWidth={score >= 0.7 ? 2.8 : score >= 0.4 ? 1.8 : 1}
            strokeOpacity={selectedId === p.id ? 1 : score >= 0.7 ? 0.85 : score >= 0.4 ? 0.5 : 0.22} />;
        })}
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
