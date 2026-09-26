// Browser proximity diagram: no inferred real-world directions or coordinates.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/components/ui';
import type { Peer } from '@/features/ble';
import { BANDS, bandAngle } from './geo';

export function NearbyMap({ peers, selectedId, onSelect, expanded = false }: {
  peers: Peer[]; selectedId: string | null; onSelect: (id: string | null) => void; expanded?: boolean;
}) {
  const c = useColors();
  const [bounds, setBounds] = useState({ width: 320, height: 360 });
  const size = Math.min(bounds.width - 16, bounds.height - 16, 600);
  const center = size / 2;
  const radii = [0.3, 0.61, 0.85].map(r => center * r);
  return (
    <View onLayout={e => setBounds(e.nativeEvent.layout)} style={{ height: expanded ? undefined : 360, flex: expanded ? 1 : undefined, minHeight: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderRadius: expanded ? 0 : 18, overflow: 'hidden' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} accessible={false} pointerEvents="none">
          {radii.map(r => <Circle key={r} cx={center} cy={center} r={r} fill="none" stroke={c.border} strokeWidth={1} />)}
        </Svg>
        <Text style={{ position: 'absolute', top: center - 8, left: center - 13, color: c.muted, fontSize: 12 }}>You</Text>
        {peers.map(p => {
          const angle = bandAngle(p, peers);
          const radius = radii[BANDS.indexOf(p.band)];
          const selected = p.user_id === selectedId;
          return <Pressable key={p.user_id} onPress={() => onSelect(p.user_id)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.band}`} accessibilityState={{ selected }}
            style={{ position: 'absolute', left: center + Math.cos(angle) * radius - 22, top: center + Math.sin(angle) * radius - 22, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? c.tint : c.surfaceAlt, borderWidth: 2, borderColor: selected ? c.tint : c.surface }}>
            <Text style={{ color: selected ? c.onTint : c.text, fontWeight: '600', fontSize: 13 }}>{p.name.split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  );
}
