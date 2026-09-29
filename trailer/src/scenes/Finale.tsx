import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, MONO} from '../theme';
import {tw, spr, mix, clamp01, inOut, inCubic, outExpo} from '../motion';
import {useLayout} from '../layout';
import {Caption} from '../components/Caption';
import {SkyField, MarkLines, MarkStars, markPt, Sphere, lockup, Wordmark} from '../components/Stars';

const TECH = ['Expo React Native', 'Supabase + pgvector', 'FastAPI', 'bge-small embeddings', 'Claude'];

export const Finale: React.FC<{speed?: number; techBeat?: boolean}> = ({speed = 1, techBeat = true}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  const lock = lockup(W, H, portrait);
  const e0 = techBeat ? 118 : 0;
  const fadeIn = tw(f, 0, 14, 0, 1, inOut);
  let mx = lock.cx, my = lock.cy, ms = lock.size;
  if (techBeat) {
    const t = tw(f, e0, e0 + 34, 0, 1, inOut);
    mx = mix(W / 2, lock.cx, t); my = mix(H / 2, lock.cy, t); ms = mix(150, lock.size, t);
  }
  const draw = techBeat ? tw(f, 2, 34, 0, 1, inOut) : tw(f, 18, 48, 0, 1, inOut);
  const settle = Math.min(f, e0 + 90);
  return (
    <AbsoluteFill style={{background: C.sky, opacity: fadeIn, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${mx}px ${my}px, rgba(82,109,170,0.28) 0px, rgba(82,109,170,0) ${Math.max(W, H) * 0.42}px)`}} />
      <SkyField W={W} H={H} f={settle} n={160} k={2.2} />
      {techBeat && TECH.map((label, i) => {
        const tin = spr(f, 6 + i * 6, {stiffness: 90, damping: 16});
        const tout = tw(f, 98, 122, 0, 1, inCubic);
        if (tin <= 0 || tout >= 1) return null;
        const ang = -Math.PI / 2 + i * ((Math.PI * 2) / 5) + f * 0.005;
        const rr = (0.6 + 0.4 * tin) * (1 - tout);
        const x = W / 2 + Math.cos(ang) * 560 * rr, y = H / 2 + Math.sin(ang) * 210 * rr;
        const depth = (Math.sin(ang) + 1) / 2;
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.9 + 0.12 * depth})`,
            opacity: clamp01(tin * 1.5) * (1 - tout) * (0.55 + 0.45 * depth), fontFamily: MONO, fontSize: 28, color: C.skyLabel, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 12}}>
            <span style={{width: 8, height: 8, borderRadius: 4, background: C.core, boxShadow: '0 0 12px rgba(183,207,255,0.9)'}} />
            {label}
          </div>
        );
      })}
      <MarkLines cx={mx} cy={my} size={ms} draw={draw} color={C.mark} />
      {techBeat ? (
        <MarkStars cx={mx} cy={my} size={ms} f={settle} />
      ) : (
        [0, 1, 2, 3, 4, 5].map((i) => {
          const g = spr(f, 2 + i * 3, {stiffness: 60, damping: 14});
          const end = markPt(mx, my, ms, i);
          const a = (i / 6) * Math.PI * 2 + 0.4;
          const start = {x: W / 2 + Math.cos(a) * W * 0.55, y: H * 0.4 + Math.sin(a) * H * 0.3};
          const x = mix(start.x, end.x, g), y = mix(start.y, end.y, g);
          const gs = ms * 0.46 * clamp01(g);
          return (
            <React.Fragment key={i}>
              {gs > 1 && <Sphere size={gs} color={i === 5 ? C.core : C.mark} cross={false} style={{left: x - gs / 2, top: y - gs / 2}} />}
              <div style={{position: 'absolute', left: x - 6, top: y - 6, width: 12, height: 12, borderRadius: 6, background: '#EEF3FF', opacity: clamp01(g * 2)}} />
            </React.Fragment>
          );
        })
      )}
      <Wordmark lock={lock} reveal={tw(f, e0 + 20, e0 + 52, 0, 1, outExpo)} />
      <Caption lines={portrait ? ['Real conversations.', 'Real connections.'] : ['Real conversations. Real connections.']} f={f} at={e0 + 38}
        size={portrait ? 62 : 50} weight={600} color={C.nightInk} align="center" tracking="-0.02em" style={{left: 0, right: 0, top: lock.subY}} />
      <Caption lines={['Built at HackGT 13.']} f={f} at={e0 + 54} size={portrait ? 32 : 28} weight={500} color={C.skyLabel} align="center" tracking="0em"
        style={{left: 0, right: 0, top: H - (portrait ? 200 : 110)}} />
    </AbsoluteFill>
  );
};
