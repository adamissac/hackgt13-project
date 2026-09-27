// Batched sighting uploads (MASTER_SPEC 7.3): queue locally, POST /ble/sightings every 30 s.
// Raw readings are sampled to at most one per token per second; the server's classifier smooths.
import { api, type BleSighting } from '@/lib/api';

export const FLUSH_MS = 5_000;
const MAX_QUEUE = 5_000; // if offline for a long time, keep the newest
const MAX_AGE_MS = 24 * 60 * 60_000;

interface Queued extends BleSighting {
  foreground: boolean;
}

let queue: Queued[] = [];
const lastQueued = new Map<string, number>();
let flushing = false;

export function enqueueSighting(token: string, rssi: number, t: number, foreground: boolean): void {
  const prev = lastQueued.get(token) ?? 0;
  if (t - prev < 1000) return;
  lastQueued.set(token, t);
  queue.push({ token, rssi: Math.round(rssi), ts: new Date(t).toISOString(), zone_id: null, foreground });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

export function pendingCount(): number {
  return queue.length;
}

export async function flushSightings(opts: { eventId: number | null; deviceModel: string | null }): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const cutoff = Date.now() - MAX_AGE_MS;
  let pending = queue.filter((s) => Date.parse(s.ts) >= cutoff);
  queue = [];
  try {
    while (pending.length) {
      // One request per foreground state, at most 2000 sightings each (server limit).
      const fg = pending[0].foreground;
      const chunk = pending.filter((s) => s.foreground === fg).slice(0, 2000);
      await api.bleSightings({
        event_id: opts.eventId,
        device_model: opts.deviceModel,
        foreground: fg,
        sightings: chunk.map(({ foreground: _f, ...s }) => s),
      });
      const sent = new Set(chunk);
      pending = pending.filter((s) => !sent.has(s));
    }
  } catch (e) {
    console.warn('[ble] upload failed, will retry', e);
    queue = [...pending, ...queue].slice(-MAX_QUEUE); // only what wasn't sent yet
  } finally {
    flushing = false;
  }
}
