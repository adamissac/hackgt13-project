import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {tw, spr, mix} from '../motion';
import {useLayout} from '../layout';
import {Phone, contentPoint} from '../components/Phone';
import {Caption} from '../components/Caption';
import {bx} from '../screens';

const ITEMS = [
  {id: 'feed2', scroll: 168, cap: 'Stay in the loop.'},
  {id: 'chat_maya', scroll: 0, cap: 'Icebreakers from what you share.'},
  {id: 'followup', scroll: 0, cap: 'A follow-up note, already drafted.'},
  {id: 'assistant', scroll: 0, cap: 'Ask about the room.'},
  {id: 'graph', scroll: 520, cap: ''},
];

// A carousel of real screens, ending with a push into the Constellation card.
export const Montage: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H} = useLayout();
  const beat = 44;
  let off = 0;
  for (let k = 1; k < ITEMS.length; k++) off += spr(f, k * beat - 8, {stiffness: 110, damping: 19});
  const s = 0.74, cy = 500, gap = 430;
  const zT = tw(f, 192, 252, 0, 1, Easing.bezier(0.55, 0, 0.9, 0.4));
  const Z = mix(1, 5.6, zT);
  const card = bx('graph', 'sky');
  const d4 = 4 - off;
  const s4 = s * (1 - 0.16 * Math.min(1, Math.abs(d4)));
  const P = contentPoint(W / 2 + d4 * gap, cy, s4, card[0] + card[2] / 2, card[1] + card[3] / 2 - ITEMS[4].scroll);
  const tgt = {x: mix(P.x, W / 2, zT), y: mix(P.y, H / 2, zT)};
  const tx = tgt.x - Z * P.x, ty = tgt.y - Z * P.y;
  return (
    <AbsoluteFill style={{background: C.paper, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `translate(${tx}px, ${ty}px) scale(${Z})`, transformOrigin: '0 0'}}>
        {ITEMS.map((it, i) => {
          const d = i - off;
          const ad = Math.min(1, Math.abs(d));
          const x = W / 2 + d * gap;
          if (x < -500 || x > W + 500) return null;
          return <Phone key={i} s={s * (1 - 0.16 * ad)} cx={x} cy={cy} layers={[{id: it.id, scroll: it.scroll}]} opacity={(1 - 0.55 * ad) * (i === 4 ? 1 : 1 - zT)} shadow={1 - 0.7 * ad} />;
        })}
      </div>
      {ITEMS.slice(0, 4).map((it, i) => (
        <Caption key={i} lines={[it.cap]} f={f} at={i === 0 ? 4 : i * beat - 2} out={(i + 1) * beat - 12} size={54} color={C.ink} align="center" style={{left: 0, right: 0, top: 948}} />
      ))}
    </AbsoluteFill>
  );
};
