import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {tw, spr, keys, mix, clamp01, inCubic, outCubic} from '../motion';
import {Phone, Crop, Tap, Glow, useS} from '../components/Phone';
import {stackAt, Shot} from '../components/Stack';
import {Caption} from '../components/Caption';
import {M, bx} from '../screens';

// Ranked match rows drop into the list, then Maya's row is highlighted and tapped.
const Cascade: React.FC<{f: number}> = ({f}) => {
  const s = useS();
  const tT = tw(f, 4, 18, 0, 1, outCubic);
  return (
    <>
      {tT < 1 && <div style={{position: 'absolute', left: (20 + 350 * tT) * s, top: 308 * s, width: 350 * (1 - tT) * s + 1, height: 36 * s, background: C.paper}} />}
      {['maya', 'daniel', 'sara'].map((key, i) => {
        const b = bx('home_off', key);
        const t = spr(f, 12 + i * 8, {stiffness: 130, damping: 19});
        if (t > 0.998) return null;
        return (
          <React.Fragment key={key}>
            <div style={{position: 'absolute', left: b[0] * s, top: (b[1] - 5) * s, width: b[2] * s, height: (b[3] + 9) * s, background: '#FFFFFF'}} />
            <Crop id="home_off" box={b} s={s} style={{left: b[0] * s, top: (b[1] + 20 * (1 - t)) * s, opacity: clamp01(t * 1.5)}} />
          </React.Fragment>
        );
      })}
      <Glow f={f} at={56} box={[30, 352, 330, 82]} color={C.tint} radius={16} />
      <Tap f={f} at={80} x={195} y={393} />
    </>
  );
};

type Bar = {y0: number; y1: number; x0: number; x1: number; track: string};

export const Matches: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const s = 0.98;
  const enter = spr(f, 0, {stiffness: 90, damping: 18});
  const cx = mix(700, 610, enter), cy = 548;
  const mScroll = keys(f, [[100, 0], [130, 440], [184, 440], [216, 1180]]);
  const shots: Shot[] = [
    {id: 'home_off', at: 0, overlay: <Cascade f={f} />},
    {id: 'match_maya', at: 86, tr: 'push', scroll: mScroll},
  ];
  const why = bx('match_maya', 'why');
  const ov = bx('match_maya', 'overlapCard');
  const aIn = spr(f, 132, {stiffness: 80, damping: 16});
  const aOut = tw(f, 196, 214, 0, 1, inCubic);
  const bIn = spr(f, 208, {stiffness: 80, damping: 16});
  const bars = (M.match_maya.bars ?? []) as Bar[];
  const shadow = '0 34px 70px rgba(15,23,42,0.16), 0 10px 22px rgba(15,23,42,0.08)';
  const B = 1.9;
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <Phone s={s} cx={cx} cy={cy} layers={stackAt(f, shots)} />
      {f >= 128 && aOut < 1 && (
        <div style={{position: 'absolute', left: 1080 - (1 - aIn) * 180, top: 330 - aOut * 50, opacity: clamp01(aIn * 1.4) * (1 - aOut), transform: `scale(${0.9 + 0.1 * aIn})`, transformOrigin: 'left center'}}>
          <Crop id="match_maya" box={why} s={1.4} radius={20} style={{position: 'relative', boxShadow: shadow}} />
        </div>
      )}
      {f >= 204 && (
        <div style={{position: 'absolute', left: 1080 - (1 - bIn) * 180, top: 400, opacity: clamp01(bIn * 1.4), transform: `scale(${0.9 + 0.1 * bIn})`, transformOrigin: 'left center'}}>
          <Crop id="match_maya" box={ov} s={B} radius={20} style={{position: 'relative', boxShadow: shadow}}>
            {bars.map((b, i) => {
              const t = tw(f, 214 + i * 6, 240 + i * 6, 0, 1, outCubic);
              if (t >= 1) return null;
              return <div key={i} style={{position: 'absolute', left: (b.x0 + (b.x1 - b.x0) * t) * B, top: (b.y0 - 0.6) * B, width: (b.x1 - b.x0) * (1 - t) * B + 1.5, height: (b.y1 - b.y0 + 1.2) * B, background: b.track}} />;
            })}
          </Crop>
        </div>
      )}
      <Caption lines={['Ranked matches.', 'Every one explained.']} f={f} at={22} out={284} size={74} color={C.ink} style={{left: 1080, top: 150}} />
    </AbsoluteFill>
  );
};
