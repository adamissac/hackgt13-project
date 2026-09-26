// AK2 proximity engine: advertise the current rotating token, run one long scan, smooth RSSI per
// token, and upload sightings every 30 s. One engine per app; screens subscribe for updates.
import * as Device from 'expo-device';
import { AppState } from 'react-native';

import { beginAdvertising, endAdvertising, requestAdvertisePermission } from './advertiser';
import { BLE_UNAVAILABLE_MESSAGE, bleAvailable } from './native';
import { requestScanPermission, startScan, stopScan } from './scanner';
import { RssiFilter, bandForRssi, type DistanceBand } from './signal';
import { TOKEN_RE, currentToken, ensureTokens, isOwnToken, msUntilRotation } from './tokens';
import { FLUSH_MS, enqueueSighting, flushSightings } from './uploader';

const STALE_MS = 15_000; // a token not heard for 15 s is gone
const PUBLISH_MS = 1_000;

export interface HeardToken {
  token: string;
  rssi: number; // smoothed
  band: DistanceBand;
  lastSeen: number;
}

export interface EngineSnapshot {
  running: boolean;
  advertising: string | null; // our current token
  heard: HeardToken[];
  error: string | null;
}

type Listener = (s: EngineSnapshot) => void;

const filters = new Map<string, RssiFilter>();
const listeners = new Set<Listener>();
let snapshot: EngineSnapshot = { running: false, advertising: null, heard: [], error: null };
let timers: ReturnType<typeof setInterval>[] = [];
let rotateTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;
let foreground = AppState.currentState === 'active';
let eventId: number | null = null;
let starting: Promise<void> | null = null;

function publish(patch: Partial<EngineSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l(snapshot));
}

function heardNow(): HeardToken[] {
  const now = Date.now();
  const out: HeardToken[] = [];
  for (const [token, f] of filters) {
    if (now - f.lastSeen > STALE_MS || f.value === null) {
      filters.delete(token);
      continue;
    }
    out.push({ token, rssi: f.value, band: bandForRssi(f.value, Device.modelName), lastSeen: f.lastSeen });
  }
  return out.sort((a, b) => b.rssi - a.rssi);
}

async function advertiseCurrent() {
  await ensureTokens();
  const token = currentToken();
  endAdvertising();
  if (token) beginAdvertising(token);
  publish({ advertising: token });
  // Rotate exactly at the window boundary (+50 ms so "now" is inside the next window).
  rotateTimer = setTimeout(() => {
    advertiseCurrent().catch((e) => publish({ error: String(e?.message ?? e) }));
  }, msUntilRotation() + 50);
}

function onSeen(localName: string | null, rssi: number | null, t: number) {
  if (!localName || rssi == null || !TOKEN_RE.test(localName) || isOwnToken(localName)) return;
  let f = filters.get(localName);
  if (!f) filters.set(localName, (f = new RssiFilter()));
  f.update(t, rssi);
  enqueueSighting(localName, rssi, t, foreground);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(snapshot);
  return () => listeners.delete(l);
}

export function getSnapshot(): EngineSnapshot {
  return snapshot;
}

export async function startEngine(opts: { eventId: number | null }): Promise<void> {
  eventId = opts.eventId;
  if (snapshot.running) return;
  if (starting) return starting;
  starting = (async () => {
    try {
      if (!bleAvailable()) throw new Error(BLE_UNAVAILABLE_MESSAGE);
      const [scanOk, advOk] = await Promise.all([requestScanPermission(), requestAdvertisePermission()]);
      if (!scanOk || !advOk) throw new Error('Bluetooth permission was denied. Allow it in Settings.');
      await advertiseCurrent();
      startScan(
        (p) => onSeen(p.localName, p.rssi, p.lastSeenAt),
        (msg) => publish({ error: msg }),
      );
      appStateSub = AppState.addEventListener('change', (s) => (foreground = s === 'active'));
      timers = [
        setInterval(() => publish({ heard: heardNow() }), PUBLISH_MS),
        setInterval(() => flushSightings({ eventId, deviceModel: Device.modelName }), FLUSH_MS),
      ];
      publish({ running: true, error: null });
    } catch (e) {
      stopEngine();
      publish({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export function stopEngine(): void {
  stopScan();
  endAdvertising();
  timers.forEach(clearInterval);
  timers = [];
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = null;
  appStateSub?.remove();
  appStateSub = null;
  filters.clear();
  if (snapshot.running) flushSightings({ eventId, deviceModel: Device.modelName });
  publish({ running: false, advertising: null, heard: [] });
}
