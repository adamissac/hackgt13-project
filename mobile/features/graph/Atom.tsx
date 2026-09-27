import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { atomLayout } from './atomLayout';
import type { Person } from './model';

import { FACET_COLORS } from '@/constants/Colors';
const LABELS = { technical: 'Technology', career: 'Career & entrepreneurship', personal: 'Personal interests', academic: 'Academics' };
const PHASES = Array.from({ length: 73 }, (_, i) => i / 72);
const ORBIT_ANGLES = [-58, 8, 66];

/** A soft halo and a crisp stellar core, rendered without expensive blur filters. */
function Sphere({ size, color, id }: { size: number; color: string; id: string }) {
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.12" stopColor="#E8EEFF" />
          <Stop offset="0.24" stopColor={color} stopOpacity={0.65} />
          <Stop offset="0.55" stopColor={color} stopOpacity={0.16} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${id})`} />
      <Path d={`M ${size / 2} ${size * .18} L ${size / 2} ${size * .82} M ${size * .18} ${size / 2} L ${size * .82} ${size / 2}`} stroke="#DDE7FF" strokeOpacity={0.65} strokeWidth={0.7} />
      <Circle cx={size / 2} cy={size / 2} r={size * .045} fill="#FFFFFF" />
    </Svg>
  );
}
export function groupByTopic(people: Person[], _topicOrder: string[], _dark: boolean) {
 const groups = Object.entries(FACET_COLORS).map(([facet, color]) => ({ label: LABELS[facet as keyof typeof LABELS], color, count: people.filter(p => p.facet === facet).length })).filter(g => g.count > 0);
 const other = people.filter(p => !p.facet).length;
 if (other) groups.push({label:'Other interests', color:'#78859A', count:other});
 return {groups, colorOf: (p: Person) => p.facet ? FACET_COLORS[p.facet] : '#78859A'};
}

// A slow orbit with counter-rotating labels. Stop while selected, off-screen,
// backgrounded, or when the system requests reduced motion.
export function Atom({ size, people, colorOf, selectedId, onSelect, paused = false }: {
  size: number; people: Person[]; colorOf: (p: Person) => string;
  selectedId: string | null; onSelect: (id: string | null) => void;
  paused?: boolean;
  colors: { text: string; muted: string; border: string; surface: string; tint: string; tintSoft: string; onTint: string };
}) {
  const { height, center } = atomLayout(size, people.length);
  const [rotation] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  // Precompute a single revolution. Native interpolation runs all motion on the
  // UI thread; no animation listener, per-frame setState, simulation, or mesh.
  const { tracks, electrons } = useMemo(() => {
    const frames = PHASES.map(phase => atomLayout(size, people.length, phase));
    const lerp = (values: number[]) => rotation.interpolate({ inputRange: PHASES, outputRange: values });
    return {
      tracks: frames[0].nodes.map((_, i) => {
        const nodes = frames.map(frame => frame.nodes[i]);
        return {
          x: lerp(nodes.map(n => n.x - size / 2)),
          y: lerp(nodes.map(n => n.y - (size + 24) / 2)),
          scale: lerp(nodes.map(n => n.scale)),
          opacity: lerp(nodes.map(n => n.opacity)),
          threadX: lerp(nodes.map(n => (n.x - size / 2) / 2)),
          threadY: lerp(nodes.map(n => (n.y - (size + 24) / 2) / 2)),
          threadScale: lerp(nodes.map(n => n.length / 100)),
          angle: rotation.interpolate({ inputRange: PHASES, outputRange: nodes.map(n => `${n.angle}deg`) }),
        };
      }),
      electrons: ORBIT_ANGLES.map((degrees, i) => {
        const roll = degrees * Math.PI / 180;
        const points = PHASES.map(phase => {
          const angle = (phase * 2 + i / 3) * Math.PI * 2;
          const x = Math.cos(angle) * (size / 2 - 34);
          const y = Math.sin(angle) * size * 0.15;
          return { x: x * Math.cos(roll) - y * Math.sin(roll), y: x * Math.sin(roll) + y * Math.cos(roll), depth: Math.sin(angle) };
        });
        return { x: lerp(points.map(p => p.x)), y: lerp(points.map(p => p.y)), scale: lerp(points.map(p => 0.8 + p.depth * 0.25)), opacity: lerp(points.map(p => 0.6 + p.depth * 0.3)) };
      }),
    };
  }, [people.length, rotation, size]);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    if (paused || selectedId || reduced || !active || !people.length) return;
    let stopped = false;
    let loop: Animated.CompositeAnimation | undefined;
    rotation.stopAnimation(value => {
      if (stopped) return;
      const settings = { toValue: 1, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web', isInteraction: false };
      Animated.timing(rotation, { ...settings, duration: (1 - value) * 90000 }).start(({ finished }) => {
        if (!finished || stopped) return;
        rotation.setValue(0);
        loop = Animated.loop(Animated.timing(rotation, { ...settings, duration: 90000 }));
        loop.start();
      });
    });
    return () => { stopped = true; loop?.stop(); rotation.stopAnimation(); };
  }, [active, paused, people.length, reduced, rotation, selectedId]));
  return (
    <View style={{ width: size, height }}>
      <Svg width={size} height={height} style={{ position: 'absolute' }} pointerEvents="none">
        <Defs><RadialGradient id="nucleusHalo">
          <Stop offset="0" stopColor="#526DAA" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#526DAA" stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx={center.x} cy={center.y} r={size * 0.55} fill="url(#nucleusHalo)" />
        {Array.from({ length: 76 }, (_, i) => (
          <Circle key={i} cx={((i * 137.508) % 100) / 100 * size} cy={((i * 73.31 + 17) % 100) / 100 * height}
            r={i % 11 === 0 ? 1.3 : .55} fill={i % 3 === 0 ? '#B7C7EF' : '#FFFFFF'} opacity={.16 + (i % 5) * .1} />
        ))}
      </Svg>
      {tracks.map((track, i) => (
        <Animated.View key={`thread-${people[i].id}`} pointerEvents="none" style={{ position: 'absolute', left: center.x - 50, top: center.y - 12, width: 100, height: 24, opacity: track.opacity,
          transform: [{ translateX: track.threadX }, { translateY: track.threadY }, { rotate: track.angle }, { scaleX: track.threadScale }] }}>
          <Svg width={100} height={24} pointerEvents="none">
            <Path d="M 0 12 L 100 12" fill="none" stroke="#ADBEDF" strokeOpacity={0.25 + Math.max(0, Math.min(1, people[i].score)) * .35} strokeWidth={0.75} />
          </Svg>
        </Animated.View>
      ))}
      <View pointerEvents="none" style={{ position: 'absolute', left: center.x - 43, top: center.y - 43, width: 86, height: 86, alignItems: 'center', justifyContent: 'center' }}>
        <Sphere size={86} color="#B7CFFF" id="coreSphere" />
        <Text style={{ position: 'absolute', top: 64, color: '#EAF0FF', fontSize: 10, fontWeight: '600', letterSpacing: 3 }}>YOU</Text>
      </View>
      {electrons.map((track, i) => <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', left: center.x - 1, top: center.y - 1, width: 2, height: 2, borderRadius: 1, backgroundColor: '#D9E4FF', opacity: track.opacity,
        transform: [{ translateX: track.x }, { translateY: track.y }, { scale: track.scale }] }} />)}
      {tracks.map((track, i) => {
        const p = people[i];
        const selected = selectedId === p.id;
        return (
          <Animated.View key={p.id} style={{ position: 'absolute', left: center.x - 32, top: center.y - 32, width: 64, height: 64, opacity: selected ? 1 : track.opacity,
            transform: [{ translateX: track.x }, { translateY: track.y }, { scale: track.scale }] }}>
          <Pressable onPress={() => onSelect(selected ? null : p.id)} accessibilityRole="button"
            accessibilityLabel={`View ${p.name}, ${p.shared[0] ?? 'shared interests'}`} accessibilityState={{ selected }}
            style={({ pressed }) => ({ width: 64, minHeight: 64, alignItems: 'center', gap: 3, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Sphere size={44} color={colorOf(p)} id={`personSphere${i}`} />
            </View>
            <Text numberOfLines={1} style={{ maxWidth: 64, color: selected ? '#FFFFFF' : '#C7D2E8', fontSize: 11, fontWeight: '500', paddingHorizontal: 3 }}>{p.first}</Text>
          </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
