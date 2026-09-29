import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '../theme';
import {FontGate} from '../fonts';
import {SkyField, MarkLines, MarkStars, MARK_PATH, lockup, Wordmark} from '../components/Stars';

// 3 second loop: every animated value has a period of exactly 90 frames, so frame 90 equals frame 0.
const Inner: React.FC = () => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const lock = lockup(W, H, false);
  const ph = (f / 90) * Math.PI * 2;
  return (
    <AbsoluteFill style={{background: C.sky}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${lock.cx}px ${lock.cy}px, rgba(82,109,170,${0.26 + 0.05 * Math.sin(ph)}) 0px, rgba(82,109,170,0) ${W * 0.42}px)`}} />
      <SkyField W={W} H={H} f={f} n={160} k={2.2} period={90} />
      <MarkLines cx={lock.cx} cy={lock.cy} size={lock.size} draw={1} color={C.mark} />
      <svg style={{position: 'absolute', left: lock.cx - lock.size / 2, top: lock.cy - lock.size / 2, overflow: 'visible'}} width={lock.size} height={lock.size} viewBox="0 0 40 40">
        <path d={MARK_PATH} pathLength={1} fill="none" stroke="#FFFFFF" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeDasharray="0.14 0.86"
          strokeDashoffset={-(f / 90)} strokeLinecap="round" opacity={0.85} />
      </svg>
      <MarkStars cx={lock.cx} cy={lock.cy} size={lock.size} f={f} period={90} />
      <Wordmark lock={lock} reveal={1} />
    </AbsoluteFill>
  );
};

export const Sting: React.FC = () => (
  <AbsoluteFill style={{background: C.sky}}>
    <FontGate><Inner /></FontGate>
  </AbsoluteFill>
);
