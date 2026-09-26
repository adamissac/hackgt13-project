import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { useColors } from '@/components/ui';

import type { Person } from './model';

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;
const press = (fn: () => void) => (Platform.OS === 'web' ? ({ onClick: fn } as object) : { onPress: fn });

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * You in the middle, a handful of people around you. Every person is fully labeled (name, match %,
 * the #1 thing you share), and line thickness = how strong the match is. Nothing to decode.
 */
export function SpokeGraph({
  size,
  people,
  selectedId,
  onSelect,
  showScore,
}: {
  size: number;
  people: Person[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showScore: boolean;
}) {
  const c = useColors();
  const mid = size / 2;
  const R = size * 0.34;
  const dot = 24;
  const max = Math.max(...people.map((p) => p.score), 0.01);
  const min = Math.min(...people.map((p) => p.score), max);

  const placed = people.map((p, i) => {
    const a = -Math.PI / 2 + (i / people.length) * 2 * Math.PI;
    return { p, x: mid + R * Math.cos(a), y: mid + R * Math.sin(a) };
  });

  return (
    <Svg width={size} height={size} accessibilityLabel="You in the middle, connected to the people you should meet">
      {placed.map(({ p, x, y }) => {
        const t = max === min ? 1 : (p.score - min) / (max - min);
        const dim = selectedId && selectedId !== p.id;
        return (
          <Line
            key={`l${p.id}`}
            x1={mid}
            y1={mid}
            x2={x}
            y2={y}
            stroke={p.id === selectedId ? c.tint : c.border}
            strokeWidth={2 + 6 * t}
            strokeLinecap="round"
            opacity={dim ? 0.35 : 1}
          />
        );
      })}

      <Circle cx={mid} cy={mid} r={30} fill={c.tint} />
      <SvgText fontFamily={FONT} x={mid} y={mid + 5} fontSize={14} fontWeight="800" fill={c.onTint} textAnchor="middle">
        You
      </SvgText>

      {placed.map(({ p, x, y }) => {
        const selected = p.id === selectedId;
        const dim = selectedId && !selected;
        const below = y >= mid - 4; // labels go on the outside of the circle
        const ly = below ? y + dot + 16 : y - dot - 26;
        return (
          <G key={p.id} opacity={dim ? 0.35 : 1} {...press(() => onSelect(selected ? null : p.id))}>
            <Circle cx={x} cy={y} r={dot + 14} fill="transparent" />
            {p.top && <Circle cx={x} cy={y} r={dot + 5} stroke={c.success} strokeWidth={3} fill="none" />}
            <Circle cx={x} cy={y} r={dot} fill={p.role === 'recruiter' ? c.ai : c.text} stroke={selected ? c.tint : c.surface} strokeWidth={selected ? 4 : 2} />
            <SvgText fontFamily={FONT} x={x} y={y + 5} fontSize={14} fontWeight="800" fill={c.surface} textAnchor="middle">
              {initials(p.name)}
            </SvgText>
            <SvgText fontFamily={FONT} x={x} y={ly} fontSize={13} fontWeight="800" fill={c.text} textAnchor="middle">
              {p.first}
              {showScore ? ` · ${Math.round(p.score * 100)}%` : ''}
            </SvgText>
            <SvgText fontFamily={FONT} x={x} y={ly + 15} fontSize={11} fill={c.muted} textAnchor="middle">
              {clip(p.shared[0] ?? '', 18)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
