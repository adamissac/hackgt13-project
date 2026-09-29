import {Easing, interpolate} from 'remotion';

export const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
export const outCubic = Easing.bezier(0.33, 1, 0.68, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const inCubic = Easing.bezier(0.32, 0, 0.67, 0);
export const iosPush = Easing.bezier(0.2, 0.9, 0.1, 1);
const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Tween f from a..b into from..to. */
export const tw = (f: number, a: number, b: number, from = 0, to = 1, easing: (t: number) => number = outExpo) =>
  interpolate(f, [a, b], [from, to], {...CL, easing});

/** Piecewise keyframes [[frame, value], ...] with easing per segment. */
export const keys = (f: number, k: [number, number][], easing: (t: number) => number = inOut) =>
  k.length === 1 ? k[0][1] : interpolate(f, k.map((p) => p[0]), k.map((p) => p[1]), {...CL, easing});

/** Analytic damped spring (continuous in f, so it also works for time-scaled frames). */
export const spr = (f: number, start: number, o: {stiffness?: number; damping?: number; mass?: number} = {}) => {
  const {stiffness = 140, damping = 22, mass = 1} = o;
  const t = (f - start) / 30;
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
