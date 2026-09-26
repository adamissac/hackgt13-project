// "Atom" view of your matches (Arjun, MASTER_SPEC 3.12 data viz).
//   nucleus  = you
//   electron = one person, orbiting on a tilted ring
//   color    = the interest you share most (each interest group shares an orbital plane)
//   opacity  = strength: solid = strong connection, light/see-through = weaker
//   orbit    = stronger matches orbit closer to you (and a little faster)
// Performance: all motion runs on the UI thread with Reanimated shared values + animated SVG props.
// React renders this once; spinning and dragging never re-render it.
import { useEffect, useMemo } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

import type { Person } from './model';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);
const AText = Animated.createAnimatedComponent(SvgText);

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;
const press = (fn: () => void) => (Platform.OS === 'web' ? ({ onClick: fn } as object) : { onPress: fn });

/** Interest colors (color-blind-safe 3-slot set) + "other". Light and dark steps. */
const TOPIC_LIGHT = ['#2A78D6', '#EB6834', '#1BAF7A'];
const TOPIC_DARK = ['#3987E5', '#D95926', '#199E70'];
const OTHER_LIGHT = '#898781';
const OTHER_DARK = '#A6ADC8';

export interface Group {
  label: string;
  color: string;
  count: number;
}

/** Group people by the interest they share with you that ranks highest for you (not generic "python"). */
export function groupByTopic(people: Person[], topicOrder: string[], dark: boolean) {
  const palette = dark ? TOPIC_DARK : TOPIC_LIGHT;
  const other = dark ? OTHER_DARK : OTHER_LIGHT;
  const rank = new Map(topicOrder.map((t, i) => [t, i]));
  const mainOf = (p: Person) => [...p.shared].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))[0] ?? '';
  const counts = new Map<string, number>();
  people.forEach((p) => mainOf(p) && counts.set(mainOf(p), (counts.get(mainOf(p)) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const color = new Map(top.map(([t], i) => [t, palette[i]]));
  const groups: Group[] = top.map(([label, count], i) => ({ label, color: palette[i], count }));
  const rest = people.filter((p) => !color.has(mainOf(p))).length;
  if (rest) groups.push({ label: 'other interests', color: other, count: rest });
  return { groups, colorOf: (p: Person) => color.get(mainOf(p)) ?? other, groupOf: (p: Person) => (color.has(mainOf(p)) ? top.findIndex(([t]) => t === mainOf(p)) : 3) };
}

/** 0..1 strength stretched over the people shown, and the matching opacity (never fully invisible). */
export function strengthOf(people: Person[]) {
  const max = Math.max(...people.map((p) => p.score), 0.01);
  const min = Math.min(...people.map((p) => p.score), max);
  return (p: Person) => (max === min ? 1 : (p.score - min) / (max - min));
}
export const alphaFor = (t: number) => 0.22 + 0.78 * t;

// orbital planes per group: inclination (around X) and node angle (around Y)
const PLANES = [
  { inc: 0.35, node: 0 },
  { inc: 1.15, node: 1.2 },
  { inc: 0.8, node: 2.6 },
  { inc: 1.45, node: 4.0 },
];

interface Electron {
  p: Person;
  color: string;
  alpha: number;
  radius: number; // orbit radius (unit)
  phase: number;
  speed: number; // radians per second
  inc: number;
  node: number;
  label: boolean;
}

// ---------- 3D math (worklets: run on the UI thread) ----------
function project(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  mid: number,
  R: number,
): { sx: number; sy: number; s: number; z: number } {
  'worklet';
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
  const s = 3.2 / (3.2 + z2);
  return { sx: mid + x1 * s * R, sy: mid + y2 * s * R, s, z: z2 };
}

function orbitPoint(radius: number, a: number, inc: number, node: number): [number, number, number] {
  'worklet';
  // circle in the XZ plane, tilted by `inc` around X, then turned by `node` around Y
  const x0 = radius * Math.cos(a);
  const z0 = radius * Math.sin(a);
  const y1 = -z0 * Math.sin(inc);
  const z1 = z0 * Math.cos(inc);
  return [x0 * Math.cos(node) - z1 * Math.sin(node), y1, x0 * Math.sin(node) + z1 * Math.cos(node)];
}

export function Atom({
  size,
  people,
  colorOf,
  groupOf,
  selectedId,
  onSelect,
  colors,
}: {
  size: number;
  people: Person[];
  colorOf: (p: Person) => string;
  groupOf: (p: Person) => number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  colors: { text: string; muted: string; border: string; surface: string };
}) {
  const mid = size / 2;
  const R = size * 0.42;

  const electrons: Electron[] = useMemo(() => {
    const strength = strengthOf(people);
    const byGroup = new Map<number, Person[]>();
    people.forEach((p) => byGroup.set(groupOf(p), [...(byGroup.get(groupOf(p)) ?? []), p]));
    const strongest = [...people].sort((a, b) => b.score - a.score).slice(0, 4).map((p) => p.id);
    const out: Electron[] = [];
    byGroup.forEach((members, g) => {
      const plane = PLANES[g % PLANES.length];
      members.forEach((p, i) => {
        const t = strength(p);
        const radius = 0.45 + 0.55 * (1 - t); // strongest closest to the nucleus
        out.push({
          p,
          color: colorOf(p),
          alpha: alphaFor(t),
          radius,
          phase: (i / members.length) * 2 * Math.PI + g * 0.7,
          speed: 0.35 / radius, // inner orbits a little faster, like a real atom
          inc: plane.inc,
          node: plane.node,
          label: strongest.includes(p.id),
        });
      });
    });
    return out;
  }, [people, colorOf, groupOf]);

  // time + view angles live on the UI thread
  const time = useSharedValue(0);
  const yaw = useSharedValue(0.4);
  const pitch = useSharedValue(-0.35);
  const spin = useSharedValue(1); // 0 = paused
  const startYaw = useSharedValue(0);
  const startPitch = useSharedValue(0);

  useEffect(() => {
    spin.value = selectedId ? 0 : 1;
  }, [selectedId, spin]);

  useFrameCallback((f) => {
    const dt = (f.timeSincePreviousFrame ?? 16) / 1000;
    time.value += dt * spin.value;
    yaw.value += dt * 0.12 * spin.value; // the whole atom slowly turns
  });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          startYaw.value = yaw.value;
          startPitch.value = pitch.value;
        },
        // writing a shared value is cheap and does not re-render React
        onPanResponderMove: (_, g) => {
          yaw.value = startYaw.value + g.dx * 0.01;
          pitch.value = Math.max(-1.2, Math.min(1.2, startPitch.value + g.dy * 0.006));
        },
      }),
    [yaw, pitch, startYaw, startPitch],
  );

  return (
    <View style={{ width: size, height: size }} {...pan.panHandlers}>
      <Svg width={size} height={size} accessibilityLabel="Atom view: you in the center, matches orbiting you. Color is the shared interest, solid means a strong connection.">
        <Defs>
          <RadialGradient id="nucleus" cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor={colors.text} stopOpacity={0.7} />
            <Stop offset="1" stopColor={colors.text} />
          </RadialGradient>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.text} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.text} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="shine" cx="35%" cy="30%" r="70%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.6} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {electrons.map((e) => (
          <Orbit key={`o${e.p.id}`} e={e} yaw={yaw} pitch={pitch} mid={mid} R={R} dim={Boolean(selectedId && selectedId !== e.p.id)} />
        ))}

        <Circle cx={mid} cy={mid} r={R * 0.3} fill="url(#halo)" />
        <Circle cx={mid} cy={mid} r={24} fill="url(#nucleus)" />
        <SvgText fontFamily={FONT} x={mid} y={mid + 5} fontSize={13} fontWeight="800" fill={colors.surface} textAnchor="middle">
          You
        </SvgText>

        {electrons.map((e) => (
          <ElectronView
            key={e.p.id}
            e={e}
            time={time}
            yaw={yaw}
            pitch={pitch}
            mid={mid}
            R={R}
            selected={selectedId === e.p.id}
            dim={Boolean(selectedId && selectedId !== e.p.id)}
            textColor={colors.text}
            onPress={() => onSelect(selectedId === e.p.id ? null : e.p.id)}
          />
        ))}
      </Svg>
    </View>
  );
}

function Orbit({ e, yaw, pitch, mid, R, dim }: { e: Electron; yaw: SharedValue<number>; pitch: SharedValue<number>; mid: number; R: number; dim: boolean }) {
  const props = useAnimatedProps(() => {
    let d = '';
    for (let k = 0; k <= 40; k++) {
      const [x, y, z] = orbitPoint(e.radius, (k / 40) * 2 * Math.PI, e.inc, e.node);
      const q = project(x, y, z, yaw.value, pitch.value, mid, R);
      d += `${k ? 'L' : 'M'}${q.sx.toFixed(1)},${q.sy.toFixed(1)}`;
    }
    return { d };
  });
  return <APath animatedProps={props} fill="none" stroke={e.color} strokeOpacity={dim ? 0.05 : e.alpha * 0.35} strokeWidth={1.2} />;
}

function ElectronView({
  e,
  time,
  yaw,
  pitch,
  mid,
  R,
  selected,
  dim,
  textColor,
  onPress,
}: {
  e: Electron;
  time: SharedValue<number>;
  yaw: SharedValue<number>;
  pitch: SharedValue<number>;
  mid: number;
  R: number;
  selected: boolean;
  dim: boolean;
  textColor: string;
  onPress: () => void;
}) {
  const pos = (): { sx: number; sy: number; s: number; z: number } => {
    'worklet';
    const [x, y, z] = orbitPoint(e.radius, e.phase + time.value * e.speed, e.inc, e.node);
    return project(x, y, z, yaw.value, pitch.value, mid, R);
  };
  // far side of the atom: smaller and fainter, so depth reads without re-sorting
  const depthFade = (z: number) => {
    'worklet';
    return z > 0 ? 1 - Math.min(0.55, z * 0.6) : 1;
  };
  const ball = useAnimatedProps(() => {
    const q = pos();
    return { cx: q.sx, cy: q.sy, r: 15 * q.s, fillOpacity: e.alpha * depthFade(q.z) };
  });
  const shine = useAnimatedProps(() => {
    const q = pos();
    return { cx: q.sx, cy: q.sy, r: 15 * q.s, opacity: depthFade(q.z) };
  });
  const ring = useAnimatedProps(() => {
    const q = pos();
    return { cx: q.sx, cy: q.sy, r: 15 * q.s + 5 };
  });
  const hit = useAnimatedProps(() => {
    const q = pos();
    return { cx: q.sx, cy: q.sy };
  });
  const label = useAnimatedProps(() => {
    const q = pos();
    return { x: q.sx, y: q.sy + 15 * q.s + 14, opacity: q.z < 0.2 ? 1 : 0 };
  });

  return (
    <G opacity={dim ? 0.2 : 1} {...press(onPress)}>
      <ACircle animatedProps={hit} r={26} fill="transparent" />
      {selected && <ACircle animatedProps={ring} fill="none" stroke={e.color} strokeWidth={3} />}
      <ACircle animatedProps={ball} fill={e.color} stroke={e.color} strokeOpacity={Math.min(1, e.alpha + 0.2)} strokeWidth={1.5} />
      <ACircle animatedProps={shine} fill="url(#shine)" />
      {(e.label || selected) && (
        <AText animatedProps={label} fontFamily={FONT} fontSize={12} fontWeight="700" fill={textColor} textAnchor="middle">
          {`${e.p.first} ${Math.round(e.p.score * 100)}%`}
        </AText>
      )}
    </G>
  );
}

