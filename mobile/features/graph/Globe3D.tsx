// 3D "people globe" (Arjun, MASTER_SPEC 3.12 data viz). You are the glowing sphere in the middle; each
// match is a shaded ball orbiting you. Distance from you = how strong the match is (closer = stronger).
// Color = the main thing you have in common, so people who share a topic cluster together on the globe.
// Real 3D: rotate + perspective-project every frame, draw back-to-front. Drag to spin, tap a ball.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { Person } from './model';

export const SPACE = { bg: '#0B0D1A', bg2: '#1A1F3D', text: '#F2F3F7', muted: '#9AA0B0' };
/** Topic colors: the 3-slot categorical set that stays distinguishable for color-blind viewers. */
export const TOPIC_COLORS = ['#4C9AFF', '#FF8A4C', '#2BD4A0'];
export const OTHER_COLOR = '#A6ADC8';

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;
const press = (fn: () => void) => (Platform.OS === 'web' ? ({ onClick: fn } as object) : { onPress: fn });
const TILT = -0.35; // look slightly down on the globe
const CAMERA = 3.2; // perspective distance (unit sphere radius = 1)

export interface Group {
  label: string;
  color: string;
  count: number;
}

/** Group people by their main shared topic: the 3 biggest groups get colors, the rest are "other". */
export function groupByTopic(
  people: Person[],
  topicOrder: string[] = [],
): { groups: Group[]; colorOf: (p: Person) => string } {
  // a person's "main" topic = the one they share with you that ranks highest for you (not just "python")
  const rank = new Map(topicOrder.map((t, i) => [t, i]));
  const mainOf = (p: Person) =>
    [...p.shared].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))[0] ?? '';
  const counts = new Map<string, number>();
  people.forEach((p) => mainOf(p) && counts.set(mainOf(p), (counts.get(mainOf(p)) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const color = new Map(top.map(([t], i) => [t, TOPIC_COLORS[i]]));
  const other = people.filter((p) => !color.has(mainOf(p))).length;
  const groups: Group[] = top.map(([label, count], i) => ({ label, color: TOPIC_COLORS[i], count }));
  if (other) groups.push({ label: 'other interests', color: OTHER_COLOR, count: other });
  return { groups, colorOf: (p) => color.get(mainOf(p)) ?? OTHER_COLOR };
}

interface Body {
  p: Person;
  color: string;
  x: number;
  y: number;
  z: number;
}

/** Stable 3D positions: each topic group owns a slice of longitude; stronger match = closer to you. */
function layout(people: Person[], colorOf: (p: Person) => string): Body[] {
  const byColor = new Map<string, Person[]>();
  people.forEach((p) => byColor.set(colorOf(p), [...(byColor.get(colorOf(p)) ?? []), p]));
  const colors = [...byColor.keys()];
  const max = Math.max(...people.map((p) => p.score), 0.01);
  const min = Math.min(...people.map((p) => p.score), max);
  const out: Body[] = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  colors.forEach((col, gi) => {
    const members = byColor.get(col)!;
    const lonCenter = (gi / colors.length) * 2 * Math.PI;
    const latCenter = colors.length > 2 ? (gi % 2 ? 0.35 : -0.35) : 0;
    const cap = Math.min(1.1, Math.PI / colors.length + 0.2); // angular size of the group's patch
    members.forEach((p, k) => {
      const d = cap * Math.sqrt((k + 0.5) / members.length);
      const phi = k * GOLDEN;
      const lat = latCenter + d * Math.sin(phi) * 0.9;
      const lon = lonCenter + (d * Math.cos(phi)) / Math.max(0.35, Math.cos(lat));
      const strength = max === min ? 1 : (p.score - min) / (max - min);
      const r = 1 - 0.4 * strength; // strongest sit closest to you
      out.push({
        p,
        color: col,
        x: r * Math.cos(lat) * Math.cos(lon),
        y: r * Math.sin(lat),
        z: r * Math.cos(lat) * Math.sin(lon),
      });
    });
  });
  return out;
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

export function Globe3D({
  size,
  people,
  colorOf,
  selectedId,
  onSelect,
}: {
  size: number;
  people: Person[];
  colorOf: (p: Person) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const bodies = useMemo(() => layout(people, colorOf), [people, colorOf]);
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(TILT);
  const dragging = useRef(false);
  const start = useRef({ yaw: 0, pitch: 0 });
  const yawRef = useRef(yaw);
  yawRef.current = yaw;

  // gentle auto-spin, paused while dragging or when someone is selected
  useEffect(() => {
    if (selectedId) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (!dragging.current && last) setYaw((y) => y + (t - last) * 0.00018);
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedId]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          dragging.current = true;
          start.current = { yaw: yawRef.current, pitch };
        },
        onPanResponderMove: (_, g) => {
          setYaw(start.current.yaw + g.dx * 0.01);
          setPitch(Math.max(-1.1, Math.min(1.1, start.current.pitch + g.dy * 0.006)));
        },
        onPanResponderRelease: () => (dragging.current = false),
        onPanResponderTerminate: () => (dragging.current = false),
      }),
    [pitch],
  );

  const mid = size / 2;
  const R = size * 0.4;
  const project = (b: Body) => {
    // rotate around Y (yaw), then X (pitch)
    const x1 = b.x * Math.cos(yaw) - b.z * Math.sin(yaw);
    const z1 = b.x * Math.sin(yaw) + b.z * Math.cos(yaw);
    const y2 = b.y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = b.y * Math.sin(pitch) + z1 * Math.cos(pitch);
    const s = CAMERA / (CAMERA + z2); // perspective: nearer = bigger
    return { sx: mid + x1 * s * R, sy: mid + y2 * s * R, s, z: z2 };
  };
  const drawn = bodies.map((b) => ({ b, ...project(b) })).sort((a, c) => c.z - a.z); // far first

  return (
    <View style={[styles.wrap, { width: size, height: size }]} {...pan.panHandlers}>
      <Svg width={size} height={size} accessibilityLabel="3D globe of your matches: closer to you means a stronger match, colors are shared interests">
        <Defs>
          <RadialGradient id="space" cx="50%" cy="45%" r="75%">
            <Stop offset="0" stopColor={SPACE.bg2} />
            <Stop offset="1" stopColor={SPACE.bg} />
          </RadialGradient>
          <RadialGradient id="you" cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor="#C7CCFF" />
            <Stop offset="0.45" stopColor="#6C63FF" />
            <Stop offset="1" stopColor="#3B32B8" />
          </RadialGradient>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#6C63FF" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#6C63FF" stopOpacity={0} />
          </RadialGradient>
          {[...TOPIC_COLORS, OTHER_COLOR].map((col, i) => (
            <RadialGradient key={col} id={`ball${i}`} cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="0.25" stopColor={col} />
              <Stop offset="1" stopColor={col} stopOpacity={0.75} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill="url(#space)" />

        {/* faint orbit rings so the depth reads */}
        {[0.55, 1].map((k) => (
          <Circle key={k} cx={mid} cy={mid} r={R * k} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={1} fill="none" />
        ))}

        {/* links behind the balls; drawn far-first so front links sit on top */}
        {drawn.map(({ b, sx, sy, s, z }) => {
          const faded = selectedId && selectedId !== b.p.id;
          return (
            <Line
              key={`l${b.p.id}`}
              x1={mid}
              y1={mid}
              x2={sx}
              y2={sy}
              stroke={b.color}
              strokeOpacity={faded ? 0.08 : z < 0 ? 0.55 : 0.25}
              strokeWidth={1 + 2.5 * s * b.p.score}
            />
          );
        })}

        {/* you (drawn mid-depth: balls in front of you are drawn after) */}
        {drawn
          .filter((d) => d.z >= 0)
          .map(({ b, sx, sy, s }) => <Ball key={b.p.id} b={b} sx={sx} sy={sy} s={s} front={false} selectedId={selectedId} onSelect={onSelect} />)}
        <Circle cx={mid} cy={mid} r={R * 0.34} fill="url(#glow)" />
        <Circle cx={mid} cy={mid} r={26} fill="url(#you)" />
        <SvgText fontFamily={FONT} x={mid} y={mid + 5} fontSize={14} fontWeight="800" fill="#FFFFFF" textAnchor="middle">
          You
        </SvgText>
        {drawn
          .filter((d) => d.z < 0)
          .map(({ b, sx, sy, s }) => <Ball key={b.p.id} b={b} sx={sx} sy={sy} s={s} front selectedId={selectedId} onSelect={onSelect} />)}
      </Svg>
    </View>
  );
}

function Ball({
  b,
  sx,
  sy,
  s,
  front,
  selectedId,
  onSelect,
}: {
  b: Body;
  sx: number;
  sy: number;
  s: number;
  front: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = b.p.id === selectedId;
  const faded = selectedId && !selected;
  const r = (13 + 9 * b.p.score) * s;
  const gi = Math.max(0, [...TOPIC_COLORS, OTHER_COLOR].indexOf(b.color));
  const showLabel = selected || (!selectedId && front);
  return (
    <G opacity={faded ? 0.25 : front ? 1 : 0.55} {...press(() => onSelect(selected ? null : b.p.id))}>
      <Circle cx={sx} cy={sy} r={r + 12} fill="transparent" />
      {selected && <Circle cx={sx} cy={sy} r={r + 6} stroke="#FFFFFF" strokeWidth={2.5} fill="none" />}
      <Circle cx={sx} cy={sy} r={r} fill={`url(#ball${gi})`} />
      {r > 14 && (
        <SvgText fontFamily={FONT} x={sx} y={sy + 4} fontSize={Math.min(13, r * 0.62)} fontWeight="800" fill="#0B0D1A" textAnchor="middle">
          {initials(b.p.name)}
        </SvgText>
      )}
      {showLabel && (
        <SvgText fontFamily={FONT} x={sx} y={sy + r + 15} fontSize={12} fontWeight="700" fill={SPACE.text} textAnchor="middle">
          {b.p.first}
        </SvgText>
      )}
    </G>
  );
}

const styles = StyleSheet.create({ wrap: { borderRadius: 18, overflow: 'hidden' } });
