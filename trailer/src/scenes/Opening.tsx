import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {tw, spr, mix, inOut, outCubic, outExpo} from '../motion';
import {useLayout} from '../layout';
import {Caption} from '../components/Caption';
import {Sphere, SkyField, MarkLines, MARK_STARS, lockup, Wordmark} from '../components/Stars';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A dense web of "connections", six of which are real and become the logo's stars.
const buildNet = (W: number, H: number, mc: {x: number; y: number; size: number}) => {
  const r = rng(11);
  const N = 230;
  const pts = Array.from({length: N}, () => ({x: W * (0.03 + 0.94 * r()), y: H * (0.05 + 0.9 * r()), rank: r()}));
  const used = new Set<number>();
  const real = MARK_STARS.map(([sx, sy]) => {
    const tx = mc.x + ((sx - 20) / 40) * mc.size * 2.3;
    const ty = mc.y + ((sy - 20) / 40) * mc.size * 1.8;
    let best = 0, bd = Infinity;
    pts.forEach((p, k) => {
      const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
      if (d < bd && !used.has(k)) { bd = d; best = k; }
    });
    used.add(best);
    pts[best].rank = Math.min(pts[best].rank, 0.4);
    return best;
  });
  const edges: [number, number][] = [];
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [j, (q.x - p.x) ** 2 + (q.y - p.y) ** 2] as [number, number]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    edges.push([i, near[0][0]], [i, near[1][0]]);
    if (r() < 0.35) edges.push([i, near[2 + Math.floor(r() * 6)][0]]);
  });
  return {pts, edges, real};
};

export const Opening: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  const lock = lockup(W, H, portrait);
  const mc0 = {x: W / 2, y: portrait ? H * 0.4 : H * 0.43, size: portrait ? 360 : 330};
  const net = useMemo(() => buildNet(W, H, mc0), [W, H]);
  const realSet = useMemo(() => new Set(net.real), [net]);

  const dimT = tw(f, 124, 160, 0, 1, inOut);
  const goneT = tw(f, 178, 214, 0, 1, inOut);
  const skyT = tw(f, 176, 280, 0, 1, inOut);
  const zoom = 1 + 0.06 * tw(f, 0, 200, 0, 1, inOut);
  const Z = (p: {x: number; y: number}) => ({x: W / 2 + (p.x - W / 2) * zoom, y: H / 2 + (p.y - H / 2) * zoom});
  const moveT = tw(f, 262, 302, 0, 1, inOut);
  const mcx = mix(mc0.x, lock.cx, moveT), mcy = mix(mc0.y, lock.cy, moveT), msz = mix(mc0.size, lock.size, moveT);
  const appear = (i: number) => tw(f, 4 + net.pts[i].rank * 108, 12 + net.pts[i].rank * 108, 0, 1, outCubic);
  const growT = tw(f, 126, 172, 0, 1, inOut);
  const drawT = tw(f, 238, 280, 0, 1, inOut);
  const px = portrait ? 1.25 : 1;
  const cap = portrait ? 76 : 86;
  const textShade = 1 - tw(f, 170, 190);

  return (
    <AbsoluteFill style={{background: C.night, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: C.sky, opacity: skyT}} />
      <AbsoluteFill style={{opacity: skyT, background: `radial-gradient(circle at ${mcx}px ${mcy}px, rgba(82,109,170,0.26) 0px, rgba(82,109,170,0) ${Math.max(W, H) * 0.45}px)`}} />
      <SkyField W={W} H={H} f={f} n={150} k={2.2} opacity={skyT * 0.9} />
      {goneT < 1 && (
        <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
          {net.edges.map(([a, b], i) => {
            const o = Math.min(appear(a), appear(b)) * 0.15 * (1 - 0.8 * dimT) * (1 - goneT);
            if (o < 0.004) return null;
            const p = Z(net.pts[a]), q = Z(net.pts[b]);
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#9AA0A9" strokeOpacity={o} strokeWidth={1.1 * px} />;
          })}
          {net.pts.map((p0, i) => {
            if (realSet.has(i)) return null;
            const a = appear(i);
            const o = a * 0.62 * (1 - 0.84 * dimT) * (1 - goneT);
            if (o < 0.004) return null;
            const p = Z(p0);
            return <circle key={i} cx={p.x} cy={p.y} r={(2 + (i % 3) * 0.6) * px * (0.6 + 0.4 * a)} fill="#AEB4BD" opacity={o} />;
          })}
        </svg>
      )}
      <AbsoluteFill style={{opacity: textShade * 0.9, background: `radial-gradient(ellipse at 50% 50%, rgba(15,17,21,0.82) 0%, rgba(15,17,21,0) ${portrait ? 46 : 38}%)`}} />
      <MarkLines cx={mcx} cy={mcy} size={msz} draw={drawT} color={C.mark} />
      {net.real.map((idx, i) => {
        const start = Z(net.pts[idx]);
        const [sx, sy, sr] = MARK_STARS[i];
        const target = {x: mcx + ((sx - 20) / 40) * msz, y: mcy + ((sy - 20) / 40) * msz};
        const g = spr(f, 186 + i * 4, {stiffness: 55, damping: 13});
        const x = mix(start.x, target.x, g), y = mix(start.y, target.y, g);
        const a = appear(idx);
        const coreR = mix(2.4 * px, (sr / 40) * msz * 0.5, tw(f, 186, 250, 0, 1, inOut));
        const glow = growT * (msz / 330) * 150 * (1 + 0.06 * Math.sin(f * 0.1 + i));
        return (
          <React.Fragment key={i}>
            {glow > 1 && <Sphere size={glow} color={i === 5 ? C.core : C.mark} cross={false} style={{left: x - glow / 2, top: y - glow / 2, opacity: growT}} />}
            <div style={{position: 'absolute', left: x - coreR, top: y - coreR, width: coreR * 2, height: coreR * 2, borderRadius: '50%', background: growT > 0.4 ? '#EEF3FF' : '#C9CED6', opacity: Math.max(a * 0.65, growT)}} />
          </React.Fragment>
        );
      })}
      <Caption lines={['Networking has a', 'quantity problem.']} f={f} at={10} out={66} size={cap} color={C.nightInk} align="center" style={{left: 0, right: 0, top: H / 2 - cap * 1.1}} />
      <Caption lines={['500+ connections.']} f={f} at={74} out={114} size={portrait ? 104 : 128} color={C.nightInk} align="center" style={{left: 0, right: 0, top: H / 2 - (portrait ? 58 : 70)}} />
      <Caption lines={['How many have you', 'actually talked to?']} f={f} at={120} out={172} size={cap} color={C.nightInk} align="center" style={{left: 0, right: 0, top: H / 2 - cap * 1.1}} />
      <Caption lines={['What if every', 'connection was real?']} f={f} at={192} out={250} size={portrait ? 70 : 72} color={C.nightInk} align="center" style={{left: 0, right: 0, top: portrait ? H * 0.64 : H * 0.72}} />
      <Wordmark lock={lock} reveal={tw(f, 272, 306, 0, 1, outExpo)} />
      <Caption lines={portrait ? ['Only connect with people', 'you’ve actually talked to.'] : ['Only connect with people you’ve actually talked to.']}
        f={f} at={292} size={portrait ? 44 : 40} weight={500} color={C.skyLabel} align="center" tracking="-0.015em" style={{left: 0, right: 0, top: lock.subY}} />
    </AbsoluteFill>
  );
};
