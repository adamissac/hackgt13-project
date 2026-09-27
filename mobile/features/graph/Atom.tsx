import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { atomLayout } from './atomLayout';
import type { Person } from './model';

import { FACET_COLORS } from '@/constants/Colors';
const LABELS = { technical: 'Technology', career: 'Career & entrepreneurship', personal: 'Personal interests', academic: 'Academics' };
const PHASES = Array.from({ length: 73 }, (_, i) => i / 72);
const ORBIT_ANGLES = [-58, 8, 66];

/** Static vector lighting, not a blur/shadow filter or a WebGL material. */
function Sphere({ size, color, id }: { size: number; color: string; id: string }) {
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="32%" cy="25%" rx="80%" ry="80%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.92} />
          <Stop offset="0.28" stopColor={color} stopOpacity={0.6} />
          <Stop offset="0.66" stopColor={color} />
          <Stop offset="1" stopColor="#25272B" />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={color} />
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${id})`} />
      <Ellipse cx={size * 0.35} cy={size * 0.23} rx={size * 0.15} ry={size * 0.07} fill="#FFFFFF" opacity={0.28} transform={`rotate(-25 ${size * 0.35} ${size * 0.23})`} />
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
export function Atom({ size, people, colorOf, selectedId, onSelect, colors, paused = false }: {
  size: number; people: Person[]; colorOf: (p: Person) => string;
  selectedId: string | null; onSelect: (id: string | null) => void;
  paused?: boolean;
  colors: { text: string; muted: string; border: string; surface: string; tint: string; tintSoft: string; onTint: string };
}) {
  const { height, center, radius } = atomLayout(size, people.length);
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
          <Stop offset="0" stopColor={colors.tint} stopOpacity={0.12} />
          <Stop offset="1" stopColor={colors.tint} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx={center.x} cy={center.y} r={size * 0.36} fill="url(#nucleusHalo)" />
        <Ellipse cx={center.x} cy={center.y + 57} rx={44} ry={8} fill={colors.tint} opacity={0.04} />
        {ORBIT_ANGLES.map((angle, i) => <Ellipse key={angle} cx={center.x} cy={center.y} rx={radius} ry={size * 0.15}
          transform={`rotate(${angle} ${center.x} ${center.y})`} fill="none" stroke={Object.values(FACET_COLORS)[i]} strokeOpacity={0.2} strokeWidth={1} />)}
      </Svg>
      {tracks.map((track, i) => (
        <Animated.View key={`thread-${people[i].id}`} pointerEvents="none" style={{ position: 'absolute', left: center.x - 50, top: center.y - 12, width: 100, height: 24, opacity: track.opacity,
          transform: [{ translateX: track.threadX }, { translateY: track.threadY }, { rotate: track.angle }, { scaleX: track.threadScale }] }}>
          <Svg width={100} height={24} pointerEvents="none">
            <Path d={`M 0 12 Q 48 ${i % 2 ? 22 : 2} 100 12`} fill="none" stroke={colorOf(people[i])} strokeOpacity={0.32} strokeWidth={1 + Math.max(0, Math.min(1, people[i].score))} />
          </Svg>
        </Animated.View>
      ))}
      <View pointerEvents="none" style={{ position: 'absolute', left: center.x - 43, top: center.y - 43, width: 86, height: 86, alignItems: 'center', justifyContent: 'center' }}>
        <Sphere size={86} color={colors.tint} id="coreSphere" />
        <View style={{ position: 'absolute', left: 9, top: 12, opacity: 0.7 }}><Sphere size={19} color={FACET_COLORS.technical} id="coreSatelliteA" /></View>
        <View style={{ position: 'absolute', right: 7, bottom: 12, opacity: 0.55 }}><Sphere size={15} color={FACET_COLORS.personal} id="coreSatelliteB" /></View>
        <Text style={{ position: 'absolute', color: colors.onTint, fontSize: 15, fontWeight: '600' }}>You</Text>
      </View>
      {electrons.map((track, i) => <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', left: center.x - 5, top: center.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: Object.values(FACET_COLORS)[i], borderWidth: 2, borderColor: colors.surface, opacity: track.opacity,
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
              <Text style={{ position: 'absolute', color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{(p.name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('')}</Text>
            </View>
            <Text numberOfLines={1} style={{ maxWidth: 56, color: colors.text, fontSize: 11, fontWeight: '600', backgroundColor: colors.surface, paddingHorizontal: 3 }}>{p.first}</Text>
          </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
