import React from 'react';
import {FONT} from '../theme';
import {tw, outExpo, inCubic} from '../motion';

/** Headline lines that rise in behind a mask and leave upward. */
export const Caption: React.FC<{
  lines: string[]; f: number; at: number; out?: number; size: number; color: string; weight?: number;
  align?: 'left' | 'center'; stagger?: number; lh?: number; style?: React.CSSProperties; tracking?: string;
}> = ({lines, f, at, out, size, color, weight = 700, align = 'left', stagger = 5, lh = 1.1, style, tracking = '-0.035em'}) => {
  if (f < at - 1) return null;
  if (out !== undefined && f > out + 18 + lines.length * 3) return null;
  return (
    <div style={{position: 'absolute', fontFamily: FONT, fontSize: size, fontWeight: weight, letterSpacing: tracking, lineHeight: lh, color, textAlign: align, ...style}}>
      {lines.map((line, i) => {
        const a = at + i * stagger;
        const pin = tw(f, a, a + 24, 0, 1, outExpo);
        const po = out === undefined ? 0 : tw(f, out + i * 3, out + i * 3 + 14, 0, 1, inCubic);
        return (
          <div key={i} style={{overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em'}}>
            <div style={{transform: `translateY(${(1 - pin) * 112 - po * 112}%)`, opacity: Math.min(1, pin * 2) * (1 - po), whiteSpace: 'nowrap'}}>{line}</div>
          </div>
        );
      })}
    </div>
  );
};
