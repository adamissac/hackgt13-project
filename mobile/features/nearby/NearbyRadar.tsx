// Nearby radar (MASTER_SPEC 3.4, data viz). Three rings = the three Bluetooth distance bands.
// A dot's angle is stable per person but is NOT a direction; Bluetooth can't tell direction or
// exact distance. Dot size = match strength; strong matches are filled with the accent color.
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';

import { useColors } from '@/components/ui';
import type { Peer } from '@/features/ble';

import { BANDS, peerAngle } from './geo';

export interface RadarPeer extends Peer {
  score: number;
}

export function NearbyRadar({ peers, onSelect }: { peers: RadarPeer[]; onSelect: (userId: string) => void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 340);
  const mid = size / 2;
  const rings = [mid * 0.36, mid * 0.68, mid * 0.97];

  const place = (p: RadarPeer) => {
    const i = BANDS.indexOf(p.band);
    const inner = i === 0 ? 30 : rings[i - 1] + 6;
    const outer = rings[i] - 18;
    const r = inner + (outer - inner) * 0.5;
    const a = peerAngle(p.user_id);
    return { x: mid + r * Math.cos(a), y: mid + r * Math.sin(a) };
  };

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} accessibilityLabel={`Radar showing ${peers.length} matches nearby`}>
        {[...rings].reverse().map((r, i) => (
          <Circle key={r} cx={mid} cy={mid} r={r} stroke={c.border} strokeWidth={1.5} fill={c.tint} fillOpacity={0.03 + i * 0.03} />
        ))}
        {BANDS.map((b, i) => (
          <SvgText key={b} x={mid} y={mid - rings[i] + 14} fill={c.muted} fontSize={11} fontWeight="600" textAnchor="middle">
            {b}
          </SvgText>
        ))}
        <Circle cx={mid} cy={mid} r={16} fill={c.tint} />
        <SvgText x={mid} y={mid + 4} fill={c.onTint} fontSize={11} fontWeight="bold" textAnchor="middle">
          YOU
        </SvgText>
        {peers.map((p) => {
          const { x, y } = place(p);
          const r = 12 + Math.round(p.score * 10);
          const strong = p.highlight || p.score >= 0.8;
          return (
            <G key={p.user_id} onPress={() => onSelect(p.user_id)}>
              <Circle cx={x} cy={y} r={r} fill={strong ? c.tint : c.surface} stroke={c.tint} strokeWidth={strong ? 0 : 2} />
              <SvgText x={x} y={y + 4} fill={strong ? c.onTint : c.tint} fontSize={12} fontWeight="bold" textAnchor="middle">
                {p.name.split(' ')[0].slice(0, 5)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {/* Screen readers can't tap SVG shapes reliably: the same people as buttons. */}
      <View style={styles.a11y} accessibilityElementsHidden={false} importantForAccessibility="yes">
        {peers.map((p) => (
          <Pressable key={p.user_id} onPress={() => onSelect(p.user_id)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.band}`}>
            <Text style={styles.hidden}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  a11y: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  hidden: { fontSize: 1 },
});
