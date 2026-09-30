import {createContext} from 'react';
import T from './timeline.json';

// Beat grid shared by picture and score. 120 BPM = 15 frames per beat (main), 150 BPM = 12 frames (vertical at 1.25x).
export type Cut = 'main' | 'vertical';
export const BeatCtx = createContext<{g: number; cut: Cut}>({g: 0, cut: 'main'});
const MU = (T as any).music as Record<Cut, any>;
export const fpb = (cut: Cut) => 1800 / MU[cut].bpm;

/** True wherever the score has drums, so the picture pulses only when the music does. */
export const drumsOn = (cut: Cut, g: number) => {
  const m = MU[cut];
  const bar = 4 * fpb(cut);
  if (g >= m.drop && g < m.breakdown[0]) return true;
  if (g >= m.breakdown[1] - bar && g < m.breakdown[1]) return true;
  if (m.tech && g >= m.tech[0] && g < m.tech[1]) return true;
  return false;
};
export const kickEnv = (cut: Cut, g: number) => (drumsOn(cut, g) ? Math.exp(-(g % fpb(cut)) / 3.5) : 0);
const hit = (g: number, t: number, a: number, tau: number) => (g >= t ? a * Math.exp(-(g - t) / tau) : 0);

/** Camera punch: big on the drop, scene changes and the final hit, small on every downbeat under drums. */
export const punch = (cut: Cut, g: number) => {
  const m = MU[cut];
  const bar = 4 * fpb(cut);
  let p = hit(g, m.drop, 0.035, 9) + hit(g, m.final, 0.045, 10);
  for (const t of m.fills) p += hit(g, t, 0.02, 7);
  if (m.tech) p += hit(g, m.tech[0], 0.028, 8);
  if (drumsOn(cut, g)) p += 0.01 * Math.exp(-(g % bar) / 4);
  return p < 0.0015 ? 0 : p;
};
/** Light flash on the biggest hits (all land on dark scenes). */
export const flash = (cut: Cut, g: number) => {
  const m = MU[cut];
  let o = hit(g, m.drop, 0.55, 5) + hit(g, m.final, 0.6, 7) + hit(g, m.breakdown[0], 0.18, 6);
  if (m.tech) o += hit(g, m.tech[0], 0.3, 5);
  return Math.min(0.7, o);
};
