import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {tw, spr, mix, clamp01, inOut, inCubic, outCubic, outExpo} from '../motion';
import {useLayout} from '../layout';
import {Phone, Crop, Tap, Glow, contentPoint, Layer} from '../components/Phone';
import {Caption} from '../components/Caption';
import {M, bx, ctr, Box} from '../screens';

// Demo cast and Bluetooth distance bands (mobile/lib/demo/people.ts, features/nearby/geo.ts).
const PEOPLE = [
  {n: 'Maya', score: 0.87, band: 0}, {n: 'Daniel', score: 0.74, band: 1}, {n: 'Sara', score: 0.68, band: 1},
  {n: 'Jordan', score: 0.63, band: 2}, {n: 'Priya', score: 0.57, band: 2},
];
const BANDS = ['Very close', 'Nearby', 'Farther away'];

const Radar: React.FC<{f: number; x: number; y: number; R: number; W: number; H: number}> = ({f, x, y, R, W, H}) => {
  const rings = [0.36, 0.68, 1].map((k) => k * R);
  const pos = PEOPLE.map((p) => {
    const same = PEOPLE.filter((q) => q.band === p.band);
    const idx = same.indexOf(p);
    const a = -Math.PI / 2 + p.band * 0.95 + idx * ((Math.PI * 2) / same.length) + (p.band === 0 ? 0.75 : 0.3);
    const rr = [0.3, 0.55, 0.86][p.band] * R;
    return {x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr};
  });
  const la = -Math.PI / 2;
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
        <circle cx={x} cy={y} r={R} fill={C.tintSoft} fillOpacity={0.4} />
        {rings.map((r, i) => <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={C.tint} strokeOpacity={0.18} strokeWidth={2} strokeDasharray={i === 2 ? '8 10' : undefined} />)}
        {[0, 1, 2].map((k) => {
          const t = (f - k * 34) / 46;
          if (t <= 0 || t >= 1) return null;
          return <circle key={k} cx={x} cy={y} r={R * 1.02 * outCubic(t)} fill="none" stroke={C.tint} strokeOpacity={0.34 * (1 - t)} strokeWidth={3} />;
        })}
        {pos.map((p, i) => {
          const t = spr(f, 14 + i * 7, {stiffness: 170, damping: 13});
          if (t <= 0) return null;
          const top = PEOPLE[i].score >= 0.8;
          const r = (11 + PEOPLE[i].score * 13) * t;
          return (
            <g key={i}>
              {top && <circle cx={p.x} cy={p.y} r={r + 12 + 4 * Math.sin(f * 0.15)} fill={C.success} fillOpacity={0.14} />}
              <circle cx={p.x} cy={p.y} r={r} fill={top ? C.success : C.tint} stroke="#FFFFFF" strokeWidth={4} />
            </g>
          );
        })}
        <circle cx={x} cy={y} r={20} fill={C.ink} stroke="#FFFFFF" strokeWidth={5} />
      </svg>
      {rings.map((r, i) => (
        <div key={i} style={{position: 'absolute', left: x + r * Math.cos(la) + 8, top: y + r * Math.sin(la) - 30, fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap'}}>{BANDS[i]}</div>
      ))}
      <div style={{position: 'absolute', left: x - 60, width: 120, top: y + 28, textAlign: 'center', fontFamily: FONT, fontSize: 24, fontWeight: 700, color: C.ink}}>You</div>
      {pos.map((p, i) => {
        const t = spr(f, 18 + i * 7, {stiffness: 120, damping: 18});
        if (t <= 0) return null;
        const top = PEOPLE[i].score >= 0.8;
        return (
          <div key={i} style={{position: 'absolute', left: PEOPLE[i].band === 0 ? p.x + 34 : p.x - 90, width: 180, top: PEOPLE[i].band === 0 ? p.y - 30 : p.y + 32, textAlign: PEOPLE[i].band === 0 ? 'left' : 'center', fontFamily: FONT, opacity: clamp01(t * 1.3), transform: `translateY(${(1 - t) * 10}px)`}}>
            <div style={{fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em'}}>{PEOPLE[i].n}</div>
            <div style={{fontSize: 20, fontWeight: 600, color: top ? C.success : C.muted}}>{Math.round(PEOPLE[i].score * 100)}% match</div>
          </div>
        );
      })}
    </>
  );
};

export const Meet: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  // Phase 1: close-up on "Let people find you", the Open to Meet switch flips on.
  const s = portrait ? 1.3 : 0.98;
  const cx = W / 2, cy = portrait ? 1000 : 548;
  const find = bx('home_off', 'findRow');
  const sw = (M.home_on.switchBox ?? [306, 232, 45, 22]) as Box;
  const [tx, ty] = ctr(sw);
  const z1 = mix(portrait ? 1.9 : 2.25, portrait ? 2.1 : 2.5, tw(f, 0, 72, 0, 1, inOut));
  const exitT = tw(f, 64, 92, 0, 1, inCubic);
  const z = z1 * (1 + 0.8 * exitT);
  const P = contentPoint(cx, cy, s, portrait ? 205 : 240, find[1] + find[3] / 2);
  const T = {x: W / 2 - z * P.x, y: H / 2 - z * P.y};
  const tap = <Tap f={f} at={30} x={tx} y={ty} />;
  // Only the switch row changes state, so cross-fade just that row (the rest of the layout differs between captures).
  const flip = tw(f, 33, 39, 0, 1, inOut);
  const l1: Layer[] = [{id: 'home_off', overlay: <>{flip > 0 && <Crop id="home_on" box={find} s={s} style={{left: find[0] * s, top: find[1] * s, opacity: flip}} />}{tap}</>}];
  const tp = contentPoint(cx, cy, s, tx, ty);
  const tpx = T.x + z * tp.x, tpy = T.y + z * tp.y;
  // Phase 2: radar of distance bands.
  const rc = portrait ? {x: 540, y: 1090, R: 390} : {x: 1250, y: 560, R: 390};
  const rIn = tw(f, 74, 100, 0, 1, outExpo);
  const rOut = tw(f, 150, 172, 0, 1, inCubic);
  // Phase 3: the suggestion card, "Want to meet", then mutual.
  const s3 = portrait ? 1.22 : 0.98;
  const c3 = portrait ? {x: 540, y: 1180} : {x: 1290, y: 548};
  const pin = spr(f, 158, {stiffness: 80, damping: 17});
  const SC = 236;
  const sug = bx('home_on', 'sugCard');
  const [wx, wy] = ctr(bx('home_on', 'want'));
  const z3 = portrait ? 1.1 : 1.26;
  const P3 = contentPoint(c3.x, c3.y, s3, 195, sug[1] + sug[3] / 2 - SC);
  const T3 = {x: c3.x - z3 * P3.x, y: c3.y - (portrait ? 30 : 0) - z3 * P3.y};
  const l3: Layer[] = f < 198 ? [{id: 'home_on', scroll: SC, overlay: <Tap f={f} at={194} x={wx} y={wy} />}]
    : f < 205 ? [{id: 'home_on', scroll: SC}, {id: 'home_mutual', scroll: SC, opacity: tw(f, 198, 205, 0, 1, inOut)}]
    : [{id: 'home_mutual', scroll: SC, overlay: <Glow f={f} at={206} box={bx('home_mutual', 'mutualCard')} />}];
  return (
    <AbsoluteFill style={{background: C.paper, overflow: 'hidden'}}>
      {f < 94 && (
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `translate(${T.x}px, ${T.y}px) scale(${z})`, transformOrigin: '0 0', opacity: 1 - tw(f, 76, 92)}}>
          <Phone s={s} cx={cx} cy={cy} layers={l1} shadow={0.6} />
        </div>
      )}
      {f > 36 && f < 110 && [0, 1].map((k) => {
        const t = tw(f, 38 + k * 12, 96 + k * 12, 0, 1, outCubic);
        const r = t * Math.hypot(W, H) * 0.7;
        return <div key={k} style={{position: 'absolute', left: tpx - r, top: tpy - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `3px solid ${C.tint}`, opacity: 0.4 * (1 - t)}} />;
      })}
      {f > 72 && rOut < 1 && (
        <div style={{position: 'absolute', inset: 0, opacity: rIn * (1 - rOut), transform: `scale(${0.9 + 0.1 * rIn - 0.08 * rOut})`, transformOrigin: `${rc.x}px ${rc.y}px`}}>
          <Radar f={f - 74} x={rc.x} y={rc.y} R={rc.R} W={W} H={H} />
        </div>
      )}
      {f >= 156 && (
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: clamp01(pin * 1.4), transform: `translate(${T3.x + (1 - pin) * 600}px, ${T3.y}px) scale(${z3})`, transformOrigin: '0 0'}}>
          <Phone s={s3} cx={c3.x} cy={c3.y} layers={l3} />
        </div>
      )}
      <Caption lines={['Find the right', 'people in the room.']} f={f} at={84} out={228} size={portrait ? 70 : 76} color={C.ink}
        align={portrait ? 'center' : 'left'} style={portrait ? {left: 0, right: 0, top: 190} : {left: 150, top: 400}} />
    </AbsoluteFill>
  );
};
