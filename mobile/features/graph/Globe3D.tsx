// 3D "people globe" (Arjun, MASTER_SPEC 3.12 data viz). You are the sphere in the middle; each match is a
// ball around you. ONE encoding for similarity, shown two ways: solid/dark color = very similar, faded/
// transparent = less similar (and stronger matches also sit closer to you). Depth only changes size.
// Static until you drag (no animation loop), and drags redraw at most once per frame, so it stays smooth.
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

import type { Person } from './model';

// Similarity color = the app's accent (colors.tint); strength is carried by opacity (solid = strong, faint = weak).
const MIN_ALPHA = 0.18;

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;
const press = (fn: () => void) => (Platform.OS === 'web' ? ({ onClick: fn } as object) : { onPress: fn });
const CAMERA = 3.2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** 0..1 similarity from match score, stretched over the people shown so differences are visible. */
export function strengthOf(people: Person[]) {
  const max = Math.max(...people.map((p) => p.score), 0.01);
  const min = Math.min(...people.map((p) => p.score), max);
  return (p: Person) => (max === min ? 1 : (p.score - min) / (max - min));
}
export const alphaFor = (t: number) => MIN_ALPHA + (1 - MIN_ALPHA) * t;

interface Body {
  p: Person;
  t: number; // similarity 0..1
  x: number;
  y: number;
  z: number;
}

function layout(people: Person[]): Body[] {
  const strength = strengthOf(people);
  const n = people.length;
  return people.map((p, k) => {
    // even spread over a sphere (Fibonacci), strongest closest to you
    const yv = 1 - (2 * (k + 0.5)) / n;
    const ring = Math.sqrt(1 - yv * yv);
    const a = k * GOLDEN;
    const t = strength(p);
    const r = 1 - 0.45 * t;
    return { p, t, x: r * ring * Math.cos(a), y: r * yv * 0.8, z: r * ring * Math.sin(a) };
  });
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

export function Globe3D({
  size,
  people,
  selectedId,
  onSelect,
  colors,
}: {
  size: number;
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  colors: { surface: string; text: string; muted: string; border: string; tint: string; onTint: string };
}) {
  const SIMILAR = colors.tint;
  const bodies = useMemo(() => layout(people), [people]);
  const [rot, setRot] = useState({ yaw: 0.5, pitch: -0.3 });
  const start = useRef(rot);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const pending = useRef<{ yaw: number; pitch: number } | null>(null);
  const frame = useRef<number | null>(null);

  const pan = useMemo(() => {
    // coalesce drag updates to one render per frame
    const schedule = (next: { yaw: number; pitch: number }) => {
      pending.current = next;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (pending.current) setRot(pending.current);
      });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        start.current = rotRef.current;
      },
      onPanResponderMove: (_, g) =>
        schedule({
          yaw: start.current.yaw + g.dx * 0.008,
          pitch: Math.max(-1, Math.min(1, start.current.pitch + g.dy * 0.005)),
        }),
    });
  }, []);

  const mid = size / 2;
  const R = size * 0.38;
  const { yaw, pitch } = rot;
  const drawn = bodies
    .map((b) => {
      const x1 = b.x * Math.cos(yaw) - b.z * Math.sin(yaw);
      const z1 = b.x * Math.sin(yaw) + b.z * Math.cos(yaw);
      const y2 = b.y * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = b.y * Math.sin(pitch) + z1 * Math.cos(pitch);
      const s = CAMERA / (CAMERA + z2);
      return { b, sx: mid + x1 * s * R, sy: mid + y2 * s * R, s, z: z2 };
    })
    .sort((a, c) => c.z - a.z); // far first

  // name labels: front-facing people only, strongest first, skipping any that would overlap a placed one
  const labeled = new Set<string>();
  if (!selectedId) {
    const boxes: { l: number; r: number; t: number; b: number }[] = [];
    [...drawn]
      .filter((d) => d.z < 0.15)
      .sort((a, c) => c.b.t - a.b.t)
      .forEach((d) => {
        const ly = d.sy + 16 * d.s + 15; // text baseline
        const w = (d.b.p.first.length + 4) * 7; // approx label width at 12px
        const box = { l: d.sx - w / 2, r: d.sx + w / 2, t: ly - 12, b: ly + 3 };
        const hitsLabel = boxes.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
        const hitsBall = drawn.some((o) => {
          if (o === d) return false;
          const rr = 16 * o.s;
          const cx = Math.max(box.l, Math.min(o.sx, box.r));
          const cy = Math.max(box.t, Math.min(o.sy, box.b));
          return Math.hypot(o.sx - cx, o.sy - cy) < rr;
        });
        if (hitsLabel || hitsBall) return;
        boxes.push(box);
        labeled.add(d.b.p.id);
      });
  } else labeled.add(selectedId);

  const ball = (d: (typeof drawn)[number]) => {
    const { b, sx, sy, s } = d;
    const selected = b.p.id === selectedId;
    const faded = selectedId && !selected;
    const alpha = alphaFor(b.t);
    const r = 16 * s;
    return (
      <G key={b.p.id} opacity={faded ? 0.3 : 1} {...press(() => onSelect(selected ? null : b.p.id))}>
        <Circle cx={sx} cy={sy} r={r + 12} fill="transparent" />
        {selected && <Circle cx={sx} cy={sy} r={r + 5} stroke={SIMILAR} strokeWidth={3} fill="none" />}
        {/* disc tinted by similarity + a light highlight so it reads as a sphere */}
        <Circle
          cx={sx}
          cy={sy}
          r={r}
          fill={SIMILAR}
          fillOpacity={alpha}
          stroke={SIMILAR}
          strokeOpacity={Math.min(1, alpha + 0.25)}
          strokeWidth={1.5}
        />
        <Circle cx={sx} cy={sy} r={r} fill="url(#shine)" />
        <SvgText
          fontFamily={FONT}
          x={sx}
          y={sy + 4}
          fontSize={Math.min(13, r * 0.6)}
          fontWeight="800"
          fill={alpha > 0.55 ? colors.onTint : SIMILAR}
          textAnchor="middle">
          {initials(b.p.name)}
        </SvgText>
        {labeled.has(b.p.id) && (
          <SvgText fontFamily={FONT} x={sx} y={sy + r + 15} fontSize={12} fontWeight="700" fill={colors.text} textAnchor="middle">
            {`${b.p.first} ${Math.round(b.p.score * 100)}%`}
          </SvgText>
        )}
      </G>
    );
  };

  return (
    <View style={[styles.wrap, { width: size, height: size }]} {...pan.panHandlers}>
      <Svg width={size} height={size} accessibilityLabel="3D view of your matches: darker and closer means more similar">
        <Defs>
          <RadialGradient id="shine" cx="35%" cy="30%" r="70%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="you" cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor={colors.text} stopOpacity={0.75} />
            <Stop offset="1" stopColor={colors.text} />
          </RadialGradient>
        </Defs>

        {/* orbit guides */}
        {[0.55, 1].map((k) => (
          <Circle key={k} cx={mid} cy={mid} r={R * k} stroke={colors.border} strokeWidth={1} fill="none" />
        ))}

        {/* links: same color and opacity rule as the balls */}
        {drawn.map(({ b, sx, sy }) => (
          <Line
            key={`l${b.p.id}`}
            x1={mid}
            y1={mid}
            x2={sx}
            y2={sy}
            stroke={SIMILAR}
            strokeOpacity={selectedId && selectedId !== b.p.id ? 0.05 : alphaFor(b.t) * 0.6}
            strokeWidth={1 + 3 * b.t}
          />
        ))}

        {drawn.filter((d) => d.z >= 0).map(ball)}
        <Circle cx={mid} cy={mid} r={26} fill="url(#you)" />
        <SvgText fontFamily={FONT} x={mid} y={mid + 5} fontSize={14} fontWeight="800" fill={colors.surface} textAnchor="middle">
          You
        </SvgText>
        {drawn.filter((d) => d.z < 0).map(ball)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { borderRadius: 18, overflow: 'hidden' } });
