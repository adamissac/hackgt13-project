// "Hold your phones together" detection. Pure logic (node-testable): feed it what the engine hears each second;
// it returns the token to claim once one phone has stayed at touching range for HOLD_MS.
export const TAP_RSSI_DBM = -50; // same threshold as the server (ml/app/routers/tap.py)
export const HOLD_MS = 2_000;

export interface Heard {
  token: string;
  rssi: number; // smoothed
}

export class TapDetector {
  private token: string | null = null;
  private since = 0;

  /** Returns { token, rssi, progress 0..1 }; token is non-null once held long enough. */
  update(heard: Heard[], now: number): { token: string | null; rssi: number | null; progress: number } {
    const best = heard.reduce<Heard | null>((b, h) => (!b || h.rssi > b.rssi ? h : b), null);
    if (!best || best.rssi < TAP_RSSI_DBM) {
      this.token = null;
      return { token: null, rssi: best?.rssi ?? null, progress: 0 };
    }
    if (best.token !== this.token) {
      this.token = best.token;
      this.since = now;
    }
    const progress = Math.min(1, (now - this.since) / HOLD_MS);
    return { token: progress >= 1 ? best.token : null, rssi: best.rssi, progress };
  }
}
