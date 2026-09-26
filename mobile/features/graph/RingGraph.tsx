import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { useColors } from '@/components/ui';
import type { GraphMode } from '@/lib/api';

import { RING_LABELS, type Placed } from './model';

const DOT = 16;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * You in the middle; everyone else on three rings (inner = stronger match).
 * `focus` = ids to emphasise (a chosen topic's people, or the selected person); others fade out and get a
 * line from you so the connection is obvious.
 */
export function RingGraph({
  size,
  placed,
  radii,
  mode,
  focus,
  selectedId,
  onSelect,
}: {
  size: number;
  placed: Placed[];
  radii: number[];
  mode: GraphMode;
  focus: Set<string> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const c = useColors();
  const mid = size / 2;
  const lit = (id: string) => !focus || focus.has(id);

  return (
    <Svg width={size} height={size} accessibilityLabel="People around you: closer to the center means a stronger match">
      {/* rings + their labels */}
      {radii.map((r, i) => (
        <G key={r}>
          <Circle cx={mid} cy={mid} r={r} stroke={c.border} strokeWidth={1} fill="none" />
          <SvgText x={mid} y={mid - r - 4} fontSize={10} fill={c.muted} textAnchor="middle">
            {RING_LABELS[mode][i]}
          </SvgText>
        </G>
      ))}

      {/* lines from you to whoever is in focus */}
      {focus &&
        placed
          .filter((p) => focus.has(p.id))
          .map((p) => <Line key={`l${p.id}`} x1={mid} y1={mid} x2={p.x} y2={p.y} stroke={c.tint} strokeOpacity={0.55} strokeWidth={2} />)}

      {/* you */}
      <Circle cx={mid} cy={mid} r={22} fill={c.tint} />
      <SvgText x={mid} y={mid + 4} fontSize={12} fontWeight="700" fill={c.onTint} textAnchor="middle">
        You
      </SvgText>

      {/* people */}
      {placed.map((p) => {
        const on = lit(p.id);
        const selected = p.id === selectedId;
        const showName = on && (selected || p.ring === 0 || (focus !== null && focus.has(p.id)));
        return (
          <G key={p.id} opacity={on ? 1 : 0.18} onPress={() => onSelect(selected ? null : p.id)}>
            {/* generous invisible hit area */}
            <Circle cx={p.x} cy={p.y} r={DOT + 8} fill="transparent" />
            {p.top && <Circle cx={p.x} cy={p.y} r={DOT + 4} stroke={c.success} strokeWidth={2.5} fill="none" />}
            <Circle
              cx={p.x}
              cy={p.y}
              r={DOT}
              fill={p.role === 'recruiter' ? c.ai : c.text}
              stroke={selected ? c.tint : c.surface}
              strokeWidth={selected ? 3 : 2}
            />
            <SvgText x={p.x} y={p.y + 4} fontSize={11} fontWeight="700" fill={c.surface} textAnchor="middle">
              {initials(p.name)}
            </SvgText>
            {showName && (
              <SvgText
                x={p.x}
                y={p.y + DOT + 14}
                fontSize={11}
                fontWeight="600"
                fill={c.text}
                textAnchor="middle">
                {p.first}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}
