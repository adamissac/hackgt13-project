import React from 'react';
import {tw, inOut, iosPush} from '../motion';
import type {Layer} from './Phone';

export type Shot = {id: string; at: number; scroll?: number; tr?: 'push' | 'fade' | 'cut'; dur?: number; overlay?: React.ReactNode};

/** Which screens are on the phone at frame f, with iOS-style push or cross-fade between them. */
export const stackAt = (f: number, shots: Shot[]): Layer[] => {
  let i = 0;
  shots.forEach((sh, k) => { if (f >= sh.at) i = k; });
  const cur = shots[i];
  const L = (sh: Shot): Layer => ({id: sh.id, scroll: sh.scroll, overlay: sh.overlay});
  if (i === 0 || cur.tr === 'cut') return [L(cur)];
  const dur = cur.dur ?? (cur.tr === 'fade' ? 8 : 18);
  const t = tw(f, cur.at, cur.at + dur, 0, 1, cur.tr === 'fade' ? inOut : iosPush);
  if (t >= 1) return [L(cur)];
  const prev = shots[i - 1];
  if (cur.tr === 'fade') return [L(prev), {...L(cur), opacity: t}];
  return [{...L(prev), x: -0.28 * 390 * t, dim: 0.1 * t}, {...L(cur), x: 390 * (1 - t)}];
};
