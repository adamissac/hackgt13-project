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
  {id: 'chat_maya', scroll: 0, cap: 'Smart icebreakers.'},
  {id: 'graph_network', scroll: 520, cap: 'Your network, mapped.'},
  {id: 'followup', scroll: 0, cap: 'Follow-ups, drafted.'},
  {id: 'assistant', scroll: 0, cap: 'Ask about the room.'},
  {id: 'graph', scroll: 520, cap: ''},
];
const BEAT = 30; // a new screen every two beats
const LAST = ITEMS.length - 1;

// Rapid carousel of real screens on the beat, ending with a push into the Constellation card.
export const Montage: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H} = useLayout();
  let off = 0;
  for (let k = 1; k < ITEMS.length; k++) off += spr(f, k * BEAT - 6, {stiffness: 170, damping: 17});
  const s = 0.74, cy = 500, gap = 430;
  const zT = tw(f, 180, 252, 0, 1, Easing.bezier(0.55, 0, 0.9, 0.4));
  const Z = mix(1, 5.6, zT);
  const card = bx('graph', 'sky');
  const dL = LAST - off;
  const sL = s * (1 - 0.16 * Math.min(1, Math.abs(dL)));
  const P = contentPoint(W / 2 + dL * gap, cy, sL, card[0] + card[2] / 2, card[1] + card[3] / 2 - ITEMS[LAST].scroll);
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
          const pop = 1 + 0.05 * Math.max(0, 1 - Math.abs(d) * 3) * Math.exp(-Math.max(0, f - i * BEAT) / 8) * (i > 0 ? 1 : 0);
          return (
            <Phone key={i} s={s * (1 - 0.16 * ad) * pop} cx={x} cy={cy} layers={[{id: it.id, scroll: it.scroll}]}
              opacity={(1 - 0.55 * ad) * (i === LAST ? 1 : 1 - zT)} shadow={1 - 0.7 * ad} />
          );
        })}
      </div>
      {ITEMS.slice(0, LAST).map((it, i) => (
        <Caption key={i} lines={[it.cap]} f={f} at={i === 0 ? 2 : i * BEAT} out={(i + 1) * BEAT - 8} size={58} color={C.ink} align="center" stagger={0} style={{left: 0, right: 0, top: 944}} />
      ))}
    </AbsoluteFill>
  );
};
