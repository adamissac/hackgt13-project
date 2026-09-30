import React, {createContext, useContext} from 'react';
import {Img, staticFile} from 'remotion';
import {M, fixedTop, fixedBottom, Box} from '../screens';
import {C, FONT} from '../theme';
import {tw, outCubic} from '../motion';
import {BeatCtx} from '../beat';

// iPhone-proportioned device, in points. Screens were captured at 390 x 774 content + 50 status + 20 home strip.
export const PH = {W: 390, H: 844, status: 50, content: 774, home: 20, bezel: 11, bodyR: 66, screenR: 55};
export const ScaleCtx = createContext(1);
export const useS = () => useContext(ScaleCtx);
export const phoneSize = (s: number) => ({w: (PH.W + PH.bezel * 2) * s, h: (PH.H + PH.bezel * 2) * s});
/** Frame position of a point given in screen-content coordinates (points). */
export const contentPoint = (cx: number, cy: number, s: number, x: number, y: number) => {
  const {w, h} = phoneSize(s);
  return {x: cx - w / 2 + (PH.bezel + x) * s, y: cy - h / 2 + (PH.bezel + PH.status + y) * s};
};

export type Layer = {id: string; scroll?: number; x?: number; opacity?: number; dim?: number; overlay?: React.ReactNode};

/** One captured screen. The middle scrolls; header and tab bar stay fixed like the real app. Overlays use image coordinates. */
export const ScreenImg: React.FC<Layer & {s: number}> = ({id, scroll = 0, s, overlay}) => {
  const d = M[id];
  const top = fixedTop(id);
  const bot = fixedBottom(id);
  const W = PH.W * s;
  const sc = Math.max(0, Math.min(scroll, Math.max(0, d.h - PH.content)));
  const src = staticFile(d.file);
  const img = (y: number) => <Img src={src} style={{position: 'absolute', left: 0, top: -y * s, width: W, maxWidth: 'none'}} />;
  return (
    <div style={{position: 'absolute', inset: 0, background: d.top, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: top * s, width: W, height: (PH.content - top - bot) * s, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, top: -(sc + top) * s, width: W, height: d.h * s}}>
          <Img src={src} style={{position: 'absolute', left: 0, top: 0, width: W, maxWidth: 'none'}} />
          <ScaleCtx.Provider value={s}>{overlay}</ScaleCtx.Provider>
        </div>
      </div>
      {top > 0 && <div style={{position: 'absolute', left: 0, top: 0, width: W, height: top * s, overflow: 'hidden'}}>{img(0)}</div>}
      {bot > 0 && <div style={{position: 'absolute', left: 0, top: (PH.content - bot) * s, width: W, height: bot * s, overflow: 'hidden'}}>{img(d.h - bot)}</div>}
    </div>
  );
};

const StatusBar: React.FC<{s: number; color: string; bg: string}> = ({s, color, bg}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: PH.W * s, height: PH.status * s, background: bg}}>
    <div style={{position: 'absolute', left: 40 * s, top: 16 * s, fontFamily: FONT, fontWeight: 600, fontSize: 17 * s, letterSpacing: -0.3 * s, lineHeight: 1, color}}>9:41</div>
    <svg style={{position: 'absolute', right: 28 * s, top: 18 * s}} width={80 * s} height={14 * s} viewBox="0 0 80 14">
      {[0, 1, 2, 3].map((i) => {
        const h = 3.5 + i * 2.6;
        return <rect key={i} x={i * 5} y={12.5 - h} width={3.3} height={h} rx={0.9} fill={color} />;
      })}
      <path d="M29.5 4.6a10 10 0 0 1 13.4 0M31.8 7.1a6.6 6.6 0 0 1 8.8 0M34.1 9.6a3.2 3.2 0 0 1 4.2 0" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <rect x={50.5} y={1.5} width={24} height={11} rx={3.4} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={1} />
      <rect x={52.5} y={3.5} width={20} height={7} rx={1.9} fill={color} />
      <path d="M76.2 5.4v3.2" stroke={color} strokeOpacity={0.4} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  </div>
);

export const Phone: React.FC<{
  s: number; cx: number; cy: number; layers?: Layer[]; screen?: React.ReactNode;
  rotY?: number; rotX?: number; opacity?: number; shadow?: number; style?: React.CSSProperties; sway?: number;
}> = ({s, cx, cy, layers = [], screen, rotY = 0, rotX = 0, opacity = 1, shadow = 1, style, sway = 0}) => {
  const {w, h} = phoneSize(s);
  // Gentle float so held shots never sit still.
  const {g} = useContext(BeatCtx);
  const ry = rotY + sway * 4 * Math.sin(g * 0.021);
  const rx = rotX + sway * 2.2 * Math.sin(g * 0.017 + 1);
  const ty = sway * 7 * Math.sin(g * 0.025 + 0.5);
  const topLayer = layers[layers.length - 1];
  const topBg = screen ? C.sky : topLayer ? M[topLayer.id].top : C.paper;
  const botBg = screen ? 'transparent' : topLayer ? M[topLayer.id].bottom : C.paper;
  const ink = screen ? '#FFFFFF' : C.ink;
  return (
    <div style={{position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity,
      transform: ry || rx || ty ? `perspective(${2600 * s}px) translateY(${ty}px) rotateY(${ry}deg) rotateX(${rx}deg)` : undefined, ...style}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: PH.bodyR * s,
        background: 'linear-gradient(145deg, #40444C 0%, #1B1D22 36%, #0C0D10 100%)',
        boxShadow: shadow > 0 ? `0 ${42 * s}px ${84 * s}px rgba(15,23,42,${0.24 * shadow}), 0 ${10 * s}px ${24 * s}px rgba(15,23,42,${0.16 * shadow})` : 'none'}} />
      <div style={{position: 'absolute', inset: 1.6 * s, borderRadius: (PH.bodyR - 1.6) * s, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.13)'}} />
      <div style={{position: 'absolute', left: PH.bezel * s, top: PH.bezel * s, width: PH.W * s, height: PH.H * s, borderRadius: PH.screenR * s, overflow: 'hidden', background: topBg}}>
        {screen ? (
          <ScaleCtx.Provider value={s}><div style={{position: 'absolute', inset: 0}}>{screen}</div></ScaleCtx.Provider>
        ) : (
          <div style={{position: 'absolute', left: 0, top: PH.status * s, width: PH.W * s, height: PH.content * s, overflow: 'hidden', background: botBg}}>
            {layers.map((l, i) => (
              <div key={`${i}-${l.id}`} style={{position: 'absolute', inset: 0, transform: `translateX(${(l.x ?? 0) * s}px)`, opacity: l.opacity ?? 1,
                boxShadow: l.x && l.x > 0 ? `${-8 * s}px 0 ${26 * s}px rgba(0,0,0,0.12)` : undefined}}>
                <ScreenImg {...l} s={s} />
                {l.dim ? <div style={{position: 'absolute', inset: 0, background: '#000', opacity: l.dim}} /> : null}
              </div>
            ))}
          </div>
        )}
        <StatusBar s={s} color={ink} bg={screen ? 'transparent' : topBg} />
        <div style={{position: 'absolute', left: 0, bottom: 0, width: PH.W * s, height: PH.home * s, background: botBg}}>
          <div style={{position: 'absolute', left: (PH.W / 2 - 67) * s, top: 8 * s, width: 134 * s, height: 5 * s, borderRadius: 3 * s, background: ink, opacity: 0.85}} />
        </div>
        <div style={{position: 'absolute', left: (PH.W / 2 - 62) * s, top: 11 * s, width: 124 * s, height: 36 * s, borderRadius: 18 * s, background: '#000'}} />
      </div>
    </div>
  );
};

/** A rectangle cut from a captured screen (points), drawn at scale s. Children use image coordinates. */
export const Crop: React.FC<{id: string; box: Box; s: number; radius?: number; style?: React.CSSProperties; children?: React.ReactNode}> = ({
  id, box, s, radius = 0, style, children,
}) => {
  const d = M[id];
  return (
    <div style={{position: 'absolute', width: box[2] * s, height: box[3] * s, overflow: 'hidden', borderRadius: radius * s, ...style}}>
      <Img src={staticFile(d.file)} style={{position: 'absolute', left: -box[0] * s, top: -box[1] * s, width: d.w * s, maxWidth: 'none'}} />
      <ScaleCtx.Provider value={s}>
        <div style={{position: 'absolute', left: -box[0] * s, top: -box[1] * s}}>{children}</div>
      </ScaleCtx.Provider>
    </div>
  );
};

/** Finger tap: press dot plus a soft ripple, in image coordinates. */
export const Tap: React.FC<{f: number; at: number; x: number; y: number; color?: string}> = ({f, at, x, y, color = C.tint}) => {
  const s = useS();
  const t = f - at;
  if (t < -6 || t > 26) return null;
  const press = t < 0 ? tw(t, -6, 0, 0, 1, outCubic) : 1 - tw(t, 4, 14, 0, 1, outCubic);
  const r = tw(t, 0, 24, 10, 40, outCubic);
  const o = t < 0 ? 0 : tw(t, 0, 24, 0.3, 0, outCubic);
  return (
    <>
      <div style={{position: 'absolute', left: (x - r) * s, top: (y - r) * s, width: 2 * r * s, height: 2 * r * s, borderRadius: '50%', background: color, opacity: o}} />
      <div style={{position: 'absolute', left: (x - 14) * s, top: (y - 14) * s, width: 28 * s, height: 28 * s, borderRadius: '50%',
        background: 'rgba(255,255,255,0.6)', border: `${1.5 * s}px solid rgba(37,39,43,0.28)`, transform: `scale(${0.7 + 0.3 * press})`, opacity: press * 0.95}} />
    </>
  );
};

/** Outline that blooms around a box (image coordinates). */
export const Glow: React.FC<{f: number; at: number; box: Box; color?: string; radius?: number}> = ({f, at, box, color = C.success, radius = 18}) => {
  const s = useS();
  const o = tw(f, at, at + 10) * (1 - tw(f, at + 30, at + 46));
  if (o <= 0) return null;
  const g = 3 + 5 * tw(f, at, at + 30, 0, 1, outCubic);
  return (
    <div style={{position: 'absolute', left: (box[0] - g) * s, top: (box[1] - g) * s, width: (box[2] + 2 * g) * s, height: (box[3] + 2 * g) * s,
      borderRadius: (radius + g) * s, border: `${2.5 * s}px solid ${color}`, opacity: o * 0.85}} />
  );
};
