import React from 'react';
import {C, FONT} from '../theme';

// The app's logo mark (components/Brand.tsx), in its 40 x 40 viewBox.
export const MARK_STARS: [number, number, number][] = [[30, 8, 3], [16, 6, 2.5], [7, 19, 3], [14, 32, 2.5], [30, 29, 3], [20, 20, 2]];
export const MARK_PATH = 'M30 8 L16 6 L7 19 L14 32 L30 29 M16 6 L20 20 L14 32 M7 19 L20 20 L30 29';
export const markPt = (cx: number, cy: number, size: number, i: number) => ({
  x: cx + ((MARK_STARS[i][0] - 20) / 40) * size, y: cy + ((MARK_STARS[i][1] - 20) / 40) * size,
});

/** The app's star (features/graph/Atom.tsx Sphere): soft halo, crisp core, no blur filters. */
export const Sphere: React.FC<{size: number; color: string; style?: React.CSSProperties; cross?: boolean}> = ({size, color, style, cross = true}) => {
  const id = 'sp' + React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const sw = Math.max(0.9, (size / 44) * 0.9);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{position: 'absolute', overflow: 'visible', ...style}}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.12" stopColor={color} />
          <stop offset="0.30" stopColor={color} stopOpacity={0.8} />
          <stop offset="0.55" stopColor={color} stopOpacity={0.16} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${id})`} />
      {cross && <path d={`M ${size / 2} ${size * 0.18} L ${size / 2} ${size * 0.82} M ${size * 0.18} ${size / 2} L ${size * 0.82} ${size / 2}`} stroke={color} strokeOpacity={0.9} strokeWidth={sw} />}
      <circle cx={size / 2} cy={size / 2} r={size * 0.045} fill="#FFFFFF" />
    </svg>
  );
};

/** Background stars laid out like the app's constellation card. */
export const SkyField: React.FC<{W: number; H: number; f: number; n?: number; k?: number; opacity?: number; period?: number}> = ({W, H, f, n = 150, k = 2.2, opacity = 1, period}) => (
  <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity}}>
    {Array.from({length: n}, (_, i) => {
      const x = (((i * 137.508) % 100) / 100) * W;
      const y = (((i * 73.31 + 17) % 100) / 100) * H;
      const r = (i % 11 === 0 ? 1.3 : 0.55) * k;
      const ph = period ? (f / period) * Math.PI * 2 : f * 0.06;
      const twk = 0.72 + 0.28 * Math.sin(ph + i * 1.7);
      return <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? '#B7C7EF' : '#FFFFFF'} opacity={(0.16 + (i % 5) * 0.1) * twk} />;
    })}
  </svg>
);

export const MarkLines: React.FC<{cx: number; cy: number; size: number; draw: number; color: string; opacity?: number; width?: number}> = ({cx, cy, size, draw, color, opacity = 0.75, width = 2.2}) => (
  <svg style={{position: 'absolute', left: cx - size / 2, top: cy - size / 2, overflow: 'visible'}} width={size} height={size} viewBox="0 0 40 40">
    <path d={MARK_PATH} stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke" fill="none" opacity={opacity}
      pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MarkStars: React.FC<{cx: number; cy: number; size: number; f: number; glow?: number; period?: number}> = ({cx, cy, size, f, glow = 1, period}) => (
  <>
    {MARK_STARS.map(([, , r], i) => {
      const p = markPt(cx, cy, size, i);
      const ph = period ? (f / period) * Math.PI * 2 : f * 0.1;
      const g = size * 0.46 * glow * (1 + 0.07 * Math.sin(ph + i * 1.3));
      const cr = (r / 40) * size * 0.5;
      return (
        <React.Fragment key={i}>
          {g > 1 && <Sphere size={g} color={i === 5 ? C.core : C.mark} cross={false} style={{left: p.x - g / 2, top: p.y - g / 2}} />}
          <div style={{position: 'absolute', left: p.x - cr, top: p.y - cr, width: cr * 2, height: cr * 2, borderRadius: '50%', background: '#EEF3FF'}} />
        </React.Fragment>
      );
    })}
  </>
);

export const measure = (text: string, px: number, weight = 700, spacing = -0.035) => {
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${weight} ${px}px Inter`;
    (ctx as any).letterSpacing = `${spacing * px}px`;
    return ctx.measureText(text).width;
  } catch {
    return text.length * px * 0.47;
  }
};

export type Lock = {cx: number; cy: number; size: number; fs: number; textX: number; textY: number; textW: number; subY: number; portrait: boolean};
/** Logo lockup geometry: mark beside the wordmark (landscape) or stacked (portrait). */
export const lockup = (W: number, H: number, portrait: boolean): Lock => {
  const fs = 124;
  const textW = measure('Constellation', fs);
  if (!portrait) {
    const ms = 176, gap = 30;
    const left = (W - (ms + gap + textW)) / 2;
    const cy = H * 0.45;
    return {cx: left + ms / 2, cy, size: ms, fs, textX: left + ms + gap, textY: cy - fs * 0.56, textW, subY: cy + 128, portrait};
  }
  const ms = 230, cy = H * 0.37;
  const textY = cy + ms / 2 + 40;
  return {cx: W / 2, cy, size: ms, fs, textX: (W - textW) / 2, textY, textW, subY: textY + fs * 1.35, portrait};
};

export const Wordmark: React.FC<{lock: Lock; reveal: number; color?: string}> = ({lock, reveal, color = C.nightInk}) => {
  const center = lock.portrait;
  const clip = center ? `inset(-25% ${(1 - reveal) * 50}% -35% ${(1 - reveal) * 50}%)` : `inset(-25% ${(1 - reveal) * 100}% -35% 0)`;
  return (
    <div style={{position: 'absolute', left: lock.textX, top: lock.textY, fontFamily: FONT, fontWeight: 700, fontSize: lock.fs, letterSpacing: '-0.035em',
      lineHeight: 1, color, whiteSpace: 'nowrap', clipPath: clip, transform: center ? undefined : `translateX(${(1 - reveal) * -28}px)`}}>
      Constellation
    </div>
  );
};
