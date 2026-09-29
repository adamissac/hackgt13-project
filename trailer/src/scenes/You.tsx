import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {tw, spr, inOut, inCubic, outCubic} from '../motion';
import {useLayout} from '../layout';
import {Phone, Crop, Tap, Glow, useS} from '../components/Phone';
import {stackAt, Shot} from '../components/Stack';
import {Caption} from '../components/Caption';
import {lockup} from '../components/Stars';
import {M, bx, ctr} from '../screens';

type Row = {y0: number; y1: number; cy: number; checkX: number; crossX: number};
const X0 = 21.5, X1 = 368.5;

// Interest rows arrive one by one (evidence wipes in), then one gets hidden and the list closes up.
const Review: React.FC<{f: number; rows: Row[]; hide: number}> = ({f, rows, hide}) => {
  const s = useS();
  const hr = rows[hide];
  const fade = tw(f, 258, 266, 0, 1, inOut);
  const shift = tw(f, 266, 284, 0, 1, inOut);
  return (
    <>
      {rows.map((r, k) => {
        const t = tw(f, 186 + k * 9, 200 + k * 9, 0, 1, outCubic);
        if (t >= 1) return null;
        return <div key={k} style={{position: 'absolute', left: (X0 + (X1 - X0) * t) * s, top: r.y0 * s, width: (X1 - X0) * (1 - t) * s + 1, height: (r.y1 - r.y0) * s, background: '#FFFFFF'}} />;
      })}
      {hr && fade > 0 && <div style={{position: 'absolute', left: X0 * s, top: hr.y0 * s, width: (X1 - X0) * s, height: (hr.y1 - hr.y0) * s, background: '#FFFFFF', opacity: fade}} />}
      {hr && shift > 0 && <Crop id="profile_review" box={[0, hr.y1 + 1, 390, 760]} s={s} style={{left: 0, top: (hr.y1 + 1 - (hr.y1 - hr.y0 + 2) * shift) * s}} />}
      {hr && <Tap f={f} at={252} x={hr.crossX} y={hr.cy} />}
    </>
  );
};

export const You: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  const lock = lockup(W, H, portrait);
  const R = tw(f, 0, 32, 0, Math.hypot(W, H) * 1.05, inCubic);
  const s = portrait ? 1.36 : 0.98;
  const cx = portrait ? W / 2 : 1330, cy = portrait ? 1238 : 548;
  const p = spr(f, 6, {stiffness: 60, damping: 15});
  const push = 1 + 0.05 * tw(f, 170, 315, 0, 1, inOut);
  const rows = (M.profile_review.rows ?? []) as Row[];
  const [lx, ly] = ctr(bx('signin', 'linkedin'));
  const [gx, gy] = ctr(bx('onboarding', 'github'));
  const shots: Shot[] = [
    {id: 'signin', at: 0, overlay: <Tap f={f} at={66} x={lx} y={ly} />},
    {id: 'onboarding', at: 80, tr: 'push', overlay: <Tap f={f} at={112} x={gx} y={gy} />},
    {id: 'onboarding_done', at: 118, tr: 'fade', overlay: <Glow f={f} at={124} box={bx('onboarding_done', 'ready')} />},
    {id: 'profile_review', at: 164, tr: 'push', scroll: 1536, overlay: <Review f={f} rows={rows} hide={Math.min(2, rows.length - 1)} />},
  ];
  const size = portrait ? 68 : 76;
  const capStyle: React.CSSProperties = portrait ? {left: 0, right: 0, top: 170} : {left: 150, top: 350};
  const secondTop = (portrait ? 170 : 350) + size * 1.1 * 2 + (portrait ? 18 : 30);
  return (
    <AbsoluteFill style={{clipPath: `circle(${R}px at ${lock.cx}px ${lock.cy}px)`, background: C.paper}}>
      <div style={{position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `${cx}px ${cy}px`}}>
        <Phone s={s} cx={cx} cy={cy + (1 - p) * 320} rotY={(1 - p) * -24} rotX={(1 - p) * 12} opacity={tw(f, 6, 16)} layers={stackAt(f, shots)} />
      </div>
      <Caption lines={['Your interests, pulled', 'from what you’ve built.']} f={f} at={40} out={298} size={size} color={C.ink} align={portrait ? 'center' : 'left'} style={capStyle} />
      <Caption lines={['With receipts.']} f={f} at={196} out={298} size={size} color={C.muted} align={portrait ? 'center' : 'left'} style={{...capStyle, top: secondTop}} />
    </AbsoluteFill>
  );
};
