import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import {tw, spr, mix, clamp01, inOut, inCubic, outCubic} from '../motion';
import {useLayout} from '../layout';
import {Phone, Crop, Tap, Glow, useS, phoneSize} from '../components/Phone';
import {stackAt, Shot} from '../components/Stack';
import {Caption} from '../components/Caption';
import {SkyField, MarkLines, MarkStars} from '../components/Stars';
import {M, bx, ctr, Box} from '../screens';

// Phones in pockets: the app quietly logs Bluetooth proximity while two people talk.
const LockScreen: React.FC<{f: number}> = ({f}) => {
  const s = useS();
  const W = 390 * s, H = 844 * s;
  const pulse = (f % 40) / 40;
  const rr = 70 * s * (1 + pulse);
  return (
    <div style={{position: 'absolute', inset: 0, background: C.sky}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 45%, rgba(82,109,170,0.34) 0px, rgba(82,109,170,0) ${260 * s}px)`}} />
      <SkyField W={W} H={H} n={46} k={1.1 * s} f={f} />
      <div style={{position: 'absolute', left: W / 2 - rr, top: H * 0.45 - rr, width: rr * 2, height: rr * 2, borderRadius: '50%', border: `${2 * s}px solid rgba(138,164,238,${0.45 * (1 - pulse)})`}} />
      <MarkLines cx={W / 2} cy={H * 0.45} size={96 * s} draw={1} color={C.mark} />
      <MarkStars cx={W / 2} cy={H * 0.45} size={96 * s} f={f} glow={0.9} />
    </div>
  );
};

const Waves: React.FC<{f: number; x1: number; x2: number; y: number; opacity: number; W: number; H: number}> = ({f, x1, x2, y, opacity, W, H}) => {
  const gap = x2 - x1;
  const arcs: React.ReactNode[] = [];
  for (const side of [0, 1]) {
    for (let k = 0; k < 4; k++) {
      if (f < 4 + k * 9) continue;
      const t = ((((f - 4 - k * 9) % 36) + 36) % 36) / 36;
      const r = 18 + t * gap * 0.55;
      const ox = side === 0 ? x1 : x2;
      const dir = side === 0 ? 1 : -1;
      const a = 0.62;
      const p0 = {x: ox + dir * r * Math.cos(a), y: y - r * Math.sin(a)};
      const p1 = {x: ox + dir * r * Math.cos(a), y: y + r * Math.sin(a)};
      arcs.push(<path key={`${side}-${k}`} d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 ${side === 0 ? 1 : 0} ${p1.x} ${p1.y}`} fill="none" stroke={C.tintDark} strokeOpacity={(1 - t) * 0.6} strokeWidth={3} strokeLinecap="round" />);
    }
  }
  return <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity}}>{arcs}</svg>;
};

const Signal: React.FC<{f: number; x: number; y: number; w: number; h: number; opacity: number; W: number; H: number}> = ({f, x, y, w, h, opacity, W, H}) => {
  const N = 90;
  const prog = tw(f, 14, 96, 0, 1, inOut);
  const v = (i: number) => {
    const t = i / (N - 1);
    const base = t < 0.32 ? mix(0.16, 0.74, (t / 0.32) ** 1.3) : 0.76;
    return clamp01(base + 0.045 * Math.sin(i * 2.1) + 0.03 * Math.sin(i * 4.7 + 1));
  };
  const X = (i: number) => x - w / 2 + (i / (N - 1)) * w;
  const Y = (val: number) => y + h / 2 - val * h;
  const n = Math.max(2, Math.floor(prog * (N - 1)) + 1);
  const pts = Array.from({length: n}, (_, i) => `${X(i)},${Y(v(i))}`).join(' ');
  const b0 = Y(0.92), b1 = Y(0.62);
  return (
    <div style={{position: 'absolute', inset: 0, opacity}}>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
        <rect x={x - w / 2} y={b0} width={w} height={b1 - b0} rx={10} fill={C.successSoft} />
        <line x1={x - w / 2} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2} stroke={C.border} strokeWidth={2} />
        <polyline points={pts} fill="none" stroke={C.tint} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={X(n - 1)} cy={Y(v(n - 1))} r={7} fill={C.tint} />
      </svg>
      <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2 - 48, fontFamily: FONT, fontSize: 24, fontWeight: 600, color: C.muted}}>Bluetooth signal</div>
      <div style={{position: 'absolute', left: x - w / 2 + 16, top: (b0 + b1) / 2 - 14, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: C.success}}>Close range</div>
    </div>
  );
};

const Chip: React.FC<{x: number; y: number; t: number; opacity: number}> = ({x, y, t, opacity}) => (
  <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * t})`, opacity: clamp01(t * 2) * opacity,
    background: C.successSoft, color: C.success, fontFamily: FONT, fontWeight: 700, fontSize: 34, letterSpacing: '-0.01em', padding: '16px 30px',
    borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 18px 40px rgba(21,128,61,0.18), 0 0 0 2px rgba(21,128,61,0.2)'}}>
    ✓ Conversation verified
  </div>
);

const Checks: React.FC<{f: number; rows: Box[]; yes: [number, number]}> = ({f, rows, yes}) => {
  const s = useS();
  return (
    <>
      {rows.slice(0, 3).map((b, i) => {
        const t = tw(f, 188 + i * 14, 194 + i * 14, 0, 1, outCubic);
        return (
          <React.Fragment key={i}>
            {t > 0 && <Crop id="checklist_checked" box={b} s={s} radius={12} style={{left: b[0] * s, top: b[1] * s, opacity: t, transform: `scale(${0.96 + 0.04 * t})`}} />}
            <Tap f={f} at={186 + i * 14} x={b[0] + b[2] * 0.35} y={b[1] + b[3] / 2} />
          </React.Fragment>
        );
      })}
      <Tap f={f} at={238} x={yes[0]} y={yes[1]} />
    </>
  );
};

export const Proof: React.FC<{speed?: number}> = ({speed = 1}) => {
  const f = useCurrentFrame() * speed;
  const {W, H, portrait} = useLayout();
  const ps = portrait ? 0.56 : 0.66;
  const py = portrait ? 780 : 470;
  const lx = portrait ? 290 : 620, rx = portrait ? 790 : 1300;
  const pw = phoneSize(ps).w;
  const inL = spr(f, 0, {stiffness: 80, damping: 17});
  const out1 = tw(f, 106, 124, 0, 1, inCubic);
  const verified = spr(f, 96, {stiffness: 170, damping: 14});
  const in2 = spr(f, 114, {stiffness: 90, damping: 18});
  const out2 = tw(f, 156, 170, 0, 1, inCubic);
  const s2 = portrait ? 1.25 : 0.98;
  const c2 = {x: W / 2, y: portrait ? 1000 : 548};
  const tb = bx('verify_code', 'tabs');
  const tabs: Box = tb[2] ? [tb[0] + 10, tb[1] + 2, tb[2] - 20, tb[3] - 4] : [12, 44, 366, 50];
  const in3 = spr(f, 160, {stiffness: 85, damping: 17});
  const s3 = portrait ? 1.3 : 0.98;
  const c3 = portrait ? {x: 540, y: 1200} : {x: 1330, y: 548};
  const rows = (M.checklist.boxes.rows ?? []) as Box[];
  const yesB = bx('checklist', 'yes');
  const yes: [number, number] = yesB[2] ? ctr(yesB) : [195, 725];
  const shots: Shot[] = [
    {id: 'checklist', at: 0, overlay: <Checks f={f} rows={rows} yes={yes} />},
    {id: 'connected', at: 244, tr: 'push'},
  ];
  return (
    <AbsoluteFill style={{background: C.paper, overflow: 'hidden'}}>
      {f < 126 && (
        <>
          <Phone s={ps} cx={lx - (1 - inL) * 520 - out1 * 700} cy={py} rotY={18} screen={<LockScreen f={f} />} />
          <Phone s={ps} cx={rx + (1 - inL) * 520 + out1 * 700} cy={py} rotY={-18} screen={<LockScreen f={f + 17} />} />
          <Waves f={f} x1={lx + pw * 0.46} x2={rx - pw * 0.46} y={py} opacity={(1 - out1) * tw(f, 8, 18) * (1 - 0.6 * tw(f, 96, 110))} W={W} H={H} />
          <Signal f={f} x={W / 2} y={portrait ? 1330 : 915} w={portrait ? 820 : 720} h={portrait ? 200 : 150} opacity={(1 - out1) * tw(f, 10, 22)} W={W} H={H} />
          {f >= 94 && <Chip x={W / 2} y={py} t={verified} opacity={1 - out1} />}
        </>
      )}
      {f >= 110 && f < 172 && (
        <div style={{position: 'absolute', inset: 0, opacity: clamp01(in2 * 1.4) * (1 - out2), transform: `translate(${-out2 * 300}px, ${(1 - in2) * 120}px)`}}>
          <Phone s={s2} cx={c2.x} cy={c2.y} layers={[{id: 'verify_code', overlay: <Glow f={f} at={126} box={tabs} color={C.tint} radius={12} />}]} />
        </div>
      )}
      {f >= 156 && (
        <div style={{position: 'absolute', inset: 0, opacity: clamp01(in3 * 1.5), transform: `translateX(${(1 - in3) * 260}px)`}}>
          <Phone s={s3} cx={c3.x} cy={c3.y} layers={stackAt(f, shots)} />
        </div>
      )}
      <Caption lines={['Verified in person.', 'Mutual. Private.']} f={f} at={170} out={288} size={portrait ? 70 : 76} color={C.ink}
        align={portrait ? 'center' : 'left'} style={portrait ? {left: 0, right: 0, top: 190} : {left: 150, top: 400}} />
    </AbsoluteFill>
  );
};
