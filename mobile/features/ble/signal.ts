// RSSI smoothing and distance bands (MASTER_SPEC 7.3). Pure functions, no React Native imports,
// so `node --experimental-strip-types features/ble/signal.test.mjs` can test them.

export type DistanceBand = 'very close' | 'nearby' | 'farther away';

export const MEDIAN_WINDOW_MS = 5_000;
// Bands from 7.3. Recalibrate Saturday from the AK6 recordings; per-model offsets go in RSSI_OFFSETS.
export const VERY_CLOSE_DBM = -60;
export const NEARBY_DBM = -75;
export const RSSI_OFFSETS: Record<string, number> = {}; // e.g. { 'Pixel 8': +4 } if a model reads low

export function bandForRssi(rssi: number, deviceModel?: string | null): DistanceBand {
  const r = rssi + (deviceModel ? (RSSI_OFFSETS[deviceModel] ?? 0) : 0);
  if (r > VERY_CLOSE_DBM) return 'very close';
  if (r >= NEARBY_DBM) return 'nearby';
  return 'farther away';
}

/** Debug only. The UI shows bands, never meters. */
export function estimateDistanceM(rssi: number, a1m = -59, n = 2.5): number {
  return 10 ** ((a1m - rssi) / (10 * n));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-token filter: 5 s rolling median feeding a 1D Kalman filter. */
export class RssiFilter {
  private window: { t: number; rssi: number }[] = [];
  private x: number | null = null; // estimate (dBm)
  private p = 0; // estimate variance
  private lastT = 0;

  private q: number;
  private r: number;

  /** q: process noise per second (how fast true RSSI drifts); r: measurement noise (dBm^2). */
  constructor(q = 1.0, r = 16) {
    this.q = q;
    this.r = r;
  }

  update(t: number, rssi: number): number {
    this.window.push({ t, rssi });
    while (this.window.length && this.window[0].t < t - MEDIAN_WINDOW_MS) this.window.shift();
    const z = median(this.window.map((w) => w.rssi));
    if (this.x === null) {
      this.x = z;
      this.p = this.r;
    } else {
      const dt = Math.max(0, (t - this.lastT) / 1000);
      this.p += this.q * dt;
      const k = this.p / (this.p + this.r);
      this.x += k * (z - this.x);
      this.p *= 1 - k;
    }
    this.lastT = t;
    return this.x;
  }

  get value(): number | null {
    return this.x;
  }

  get lastSeen(): number {
    return this.lastT;
  }
}
