import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT, STAR} from '../theme';
import {tw, spr, mix, clamp01, inOut, inCubic} from '../motion';
import {useLayout} from '../layout';
import {Caption} from '../components/Caption';
import {Sphere, SkyField} from '../components/Stars';

// The app's "Who to meet" constellation (features/graph/Atom.tsx + atomLayout.ts), then the organizer community map.
const PEOPLE = [
  {first: 'Maya', facet: 'technical', score: 0.87}, {first: 'Daniel', facet: 'technical', score: 0.74},
  {first: 'Sara', facet: 'technical', score: 0.68}, {first: 'Jordan', facet: 'career', score: 0.63}, {first: 'Priya', facet: 'personal', score: 0.57},
] as const;

const atom = (R: number, count: number, progress: number) => {
  const tilt = 0.35, roll = -0.22;
  const radii = [0.84, 1, 0.91, 0.98, 0.86, 0.96];
  const offsets = [-0.045, 0.025, -0.02, 0.04, -0.025, 0.015];
  return Array.from({length: count}, (_, i) => {
    const theta = -Math.PI / 2 + (i * Math.PI * 2) / count + offsets[i] + progress * Math.PI * 2;
    const r = R * radii[i];
    const x = Math.cos(theta) * r, y = Math.sin(theta) * r * Math.cos(tilt);
    const depth = Math.sin(theta) * Math.sin(tilt);
    return {x: x * Math.cos(roll) - y * Math.sin(roll), y: x * Math.sin(roll) + y * Math.cos(roll), scale: 0.98 + depth * 0.16, opacity: Math.min(1, 0.86 + depth * 0.22)};
  });
};

type Cl = {label: string; color: string; x: number; y: number; r: number; n: number};
// Order: A (your cluster), B (the gap partner), then the rest.
const clusters = (portrait: boolean): Cl[] => portrait ? [
  {label: 'RAG + LLM apps', color: STAR.technical, x: 560, y: 960, r: 200, n: 28},
  {label: 'Quant + trading', color: STAR.academic, x: 300, y: 560, r: 150, n: 18},
  {label: 'Recruiting', color: STAR.career, x: 810, y: 540, r: 120, n: 11},
  {label: 'Frontend + design', color: STAR.personal, x: 800, y: 1380, r: 150, n: 19},
  {label: 'EdTech + HCI', color: '#B7C7EF', x: 290, y: 1350, r: 140, n: 15},
] : [
  {label: 'RAG + LLM apps', color: STAR.technical, x: 860, y: 470, r: 190, n: 28},
  {label: 'Quant + trading', color: STAR.academic, x: 1480, y: 300, r: 145, n: 18},
  {label: 'Recruiting', color: STAR.career, x: 330, y: 330, r: 115, n: 11},
  {label: 'Frontend + design', color: STAR.personal, x: 1450, y: 760, r: 160, n: 20},
  {label: 'EdTech + HCI', color: '#B7C7EF', x: 960, y: 870, r: 130, n: 15},
];
const dotPos = (c: Cl, i: number) => {
  const rr = c.r * 0.8 * Math.sqrt((i + 0.5) / c.n);
  const a = i * 2.39996 + c.x * 0.01;
  return {x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr};
};

const CommunityMap: React.FC<{f: number; cl: Cl[]; W: number; H: number; portrait: boolean}> = ({f, cl, W, H, portrait}) => {
  const grow = mix(0.45, 1, tw(f, 150, 214, 0, 1, inOut));
  const [A, B, , Cc] = cl;
  const pC = dotPos(Cc, 2), pA = dotPos(A, 9);
  const live = tw(f, 178, 196, 0, 1, inOut);
  const flash = tw(f, 196, 200) * (1 - tw(f, 200, 224));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const g0 = {x: A.x + ux * (A.r + 14), y: A.y + uy * (A.r + 14)};
  const g1 = {x: B.x - ux * (B.r + 14), y: B.y - uy * (B.r + 14)};
  const bow = portrait ? -1 : 1;
  const mid = {x: (g0.x + g1.x) / 2 + uy * 80 * bow, y: (g0.y + g1.y) / 2 - ux * 80 * bow};
  const apex = {x: (g0.x + 2 * mid.x + g1.x) / 4, y: (g0.y + 2 * mid.y + g1.y) / 4};
  const gapT = tw(f, 198, 224, 0, 1, inOut);
  const pulse = 0.5 + 0.5 * Math.sin((f - 198) * 0.2);
  const tl = portrait ? {x0: 250, x1: 830, y: 1720} : {x0: 1210, x1: 1790, y: 1010};
  const kpos = tw(f, 150, 214, 0.35, 1, inOut);
  const kx = mix(tl.x0, tl.x1, kpos);
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
        {cl.map((c, ci) => {
          const hot = gapT > 0 && ci < 2;
          return (
            <g key={ci}>
              <circle cx={c.x} cy={c.y} r={c.r} fill={c.color} fillOpacity={0.07} stroke={hot ? '#FFC568' : c.color} strokeOpacity={hot ? 0.3 + 0.5 * pulse * gapT : 0.3} strokeWidth={hot ? 3 : 2} />
              {Array.from({length: c.n}, (_, i) => {
                const age = clamp01(c.n * grow - i);
                if (age <= 0) return null;
                const p = dotPos(c, i);
                return <circle key={i} cx={p.x} cy={p.y} r={(portrait ? 7.5 : 7) * (0.5 + 0.5 * age)} fill={c.color} opacity={0.9 * age} />;
              })}
            </g>
          );
        })}
        {live > 0 && <path d={`M ${pC.x} ${pC.y} L ${pA.x} ${pA.y}`} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={3} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - live} fill="none" strokeLinecap="round" />}
        {flash > 0 && [pC, pA].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={10 + 26 * (1 - flash)} fill="none" stroke="#FFFFFF" strokeOpacity={flash} strokeWidth={3} />)}
        {gapT > 0 && <path d={`M ${g0.x} ${g0.y} Q ${mid.x} ${mid.y} ${g1.x} ${g1.y}`} stroke="#FFC568" strokeWidth={3.5} strokeDasharray="14 12" strokeDashoffset={-f * 1.2} fill="none" opacity={gapT} strokeLinecap="round" />}
        <line x1={tl.x0} y1={tl.y} x2={tl.x1} y2={tl.y} stroke={C.skyBorder} strokeWidth={4} strokeLinecap="round" />
        <line x1={tl.x0} y1={tl.y} x2={kx} y2={tl.y} stroke={C.tintDark} strokeWidth={4} strokeLinecap="round" />
        <circle cx={kx} cy={tl.y} r={10} fill="#FFFFFF" />
        <path d={`M ${tl.x0 - 42} ${tl.y - 11} L ${tl.x0 - 42} ${tl.y + 11} L ${tl.x0 - 24} ${tl.y} Z`} fill={C.skyLabel} />
      </svg>
      {cl.map((c, i) => (
        <div key={i} style={{position: 'absolute', left: c.x - 200, width: 400, top: c.y - c.r - 48, textAlign: 'center', fontFamily: FONT, fontSize: portrait ? 30 : 28, fontWeight: 600, color: C.label, letterSpacing: '-0.01em'}}>{c.label}</div>
      ))}
      {gapT > 0 && (
        <div style={{position: 'absolute', left: apex.x, top: apex.y, transform: `translate(-50%, -50%) scale(${0.85 + 0.15 * gapT})`, opacity: gapT, background: '#FFC568', color: '#2A1E05',
          fontFamily: FONT, fontWeight: 700, fontSize: 24, padding: '8px 18px', borderRadius: 999, whiteSpace: 'nowrap'}}>2 of ~11 expected</div>
      )}
    </>
  );
};

export const Constellation: React.FC<{speed?: number; intro?: 'fade' | 'circle'}> = ({speed = 1, intro = 'fade'}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  const cl = clusters(portrait);
  const A = cl[0];
  const ac = portrait ? {x: 540, y: 960} : {x: 960, y: 540};
  const R = portrait ? 380 : 470;
  const k = (R / 129) * 0.75;
  const introO = intro === 'fade' ? tw(f, 0, 12, 0, 1, inOut) : 1;
  const clipR = intro === 'circle' ? tw(f, 0, 26, 0, Math.hypot(W, H) * 1.05, inCubic) : null;
  const pb = tw(f, 100, 152, 0, 1, inOut);
  const zc = mix(1, 0.3, pb);
  const cxA = mix(ac.x, A.x, pb), cyA = mix(ac.y, A.y, pb);
  const names = 1 - tw(f, 96, 116);
  const atomO = 1 - tw(f, 134, 158, 0, 1, inOut);
  const mapO = tw(f, 128, 158, 0, 1, inOut);
  const prog = f / (30 * 50);
  const nodes = atom(R, 5, prog);
  const thick = tw(f, 28, 70, 0, 1, inOut);
  const pop = (i: number) => (intro === 'circle' ? clamp01(spr(f, 10 + i * 6, {stiffness: 120, damping: 14})) : 1);
  const core = 86 * k;
  return (
    <AbsoluteFill style={{background: C.sky, opacity: introO, clipPath: clipR !== null ? `circle(${clipR}px at ${W / 2}px ${H / 2}px)` : undefined, overflow: 'hidden'}}>
      <SkyField W={W} H={H} f={f} n={170} k={2.2} />
      {atomO > 0 && (
        <div style={{position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: atomO, transform: `translate(${cxA}px, ${cyA}px) scale(${zc})`, transformOrigin: '0 0'}}>
          <div style={{position: 'absolute', left: -R * 1.25, top: -R * 1.25, width: R * 2.5, height: R * 2.5, borderRadius: '50%', background: 'radial-gradient(circle, rgba(82,109,170,0.24) 0%, rgba(82,109,170,0) 70%)'}} />
          <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={1} height={1}>
            {nodes.map((n, i) => (
              <line key={i} x1={0} y1={0} x2={n.x * pop(i)} y2={n.y * pop(i)} stroke={C.thread} strokeOpacity={(0.25 + PEOPLE[i].score * 0.35) * n.opacity}
                strokeWidth={0.75 * k * (1 + thick * PEOPLE[i].score * 2.2)} />
            ))}
          </svg>
          {[-58, 8, 66].map((deg, i) => {
            const rl = (deg * Math.PI) / 180;
            const ang = (prog * 2 + i / 3) * Math.PI * 2;
            const x = Math.cos(ang) * R, y = Math.sin(ang) * (2 * R + 68 * k) * 0.15;
            const ex = x * Math.cos(rl) - y * Math.sin(rl), ey = x * Math.sin(rl) + y * Math.cos(rl);
            return <div key={i} style={{position: 'absolute', left: ex - 3, top: ey - 3, width: 6, height: 6, borderRadius: 3, background: '#D9E4FF', opacity: 0.6 + Math.sin(ang) * 0.3}} />;
          })}
          <Sphere size={core} color="#B7CFFF" style={{left: -core / 2, top: -core / 2}} />
          <div style={{position: 'absolute', left: -100, width: 200, top: -core / 2 + (core * 64) / 86, textAlign: 'center', color: '#EAF0FF', fontFamily: FONT, fontSize: 10 * k, fontWeight: 600, letterSpacing: 3 * k, opacity: names}}>YOU</div>
          {nodes.map((n, i) => {
            const p = PEOPLE[i];
            const sz = (16 + p.score * 28) * k * n.scale * pop(i);
            const color = STAR[p.facet as keyof typeof STAR];
            return (
              <React.Fragment key={i}>
                {sz > 1 && <Sphere size={sz} color={color} style={{left: n.x - sz / 2, top: n.y - sz / 2, opacity: n.opacity}} />}
                <div style={{position: 'absolute', left: n.x - 120, width: 240, top: n.y + 22 * k + 4, textAlign: 'center', color: C.label, fontFamily: FONT, fontSize: 11 * k * 1.05, fontWeight: 500, opacity: names * pop(i)}}>{p.first}</div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {mapO > 0 && <div style={{position: 'absolute', inset: 0, opacity: mapO}}><CommunityMap f={f} cl={cl} W={W} H={H} portrait={portrait} /></div>}
      <Caption lines={['See the connections', 'that should happen.']} f={f} at={166} out={246} size={portrait ? 66 : 64} color={C.nightInk}
        align={portrait ? 'center' : 'left'} style={portrait ? {left: 0, right: 0, top: 170} : {left: 120, top: 830}} />
    </AbsoluteFill>
  );
};
