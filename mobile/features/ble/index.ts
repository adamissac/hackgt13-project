// Bluetooth proximity: Akshar owns this folder (MASTER_SPEC 7, tasks AK1, AK2, AK5).
// The phone only ever knows rotating tokens; the server maps sightings to people and returns
// each match's proximity band in GET /events/{id}/matches. This hook runs the radio (when the dev
// build has Bluetooth) and polls those matches, so the Nearby tab shows real people, as bands only.

import { useEffect, useState } from 'react';

import { api, type Match } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { env } from '@/lib/env';

import { startEngine, stopEngine, subscribe, type EngineSnapshot } from './engine';
import { BLE_UNAVAILABLE_MESSAGE, bleAvailable } from './native';
import type { DistanceBand } from './signal';

export type { DistanceBand } from './signal';

export interface Peer {
  user_id: string;
  name: string;
  band: DistanceBand;
  last_seen: string;
  highlight?: boolean; // top matches for this viewer: green dot on the radar
  why?: string[];
}

export interface ProximityState {
  scanning: boolean;
  peers: Peer[];
  error: string | null;
  /** Radio problem only (no Bluetooth in Expo Go, permission denied). People can still load. */
  radioError: string | null;
  /** Server problem only (couldn't load matches). */
  fetchError: string | null;
  /** 'demo' in demo mode, 'off' when the dev build has no Bluetooth, 'on' while the radio runs. */
  radio: 'demo' | 'off' | 'on';
  heardCount: number; // phones heard by this phone right now (debug; not people)
}

const POLL_MS = 15_000;
const BAND_FOR_PROXIMITY: Record<NonNullable<Match['proximity']>, DistanceBand> = {
  immediate: 'very close',
  near: 'nearby',
  far: 'farther away',
};

function toPeers(matches: Match[]): Peer[] {
  const now = new Date().toISOString();
  return matches
    .filter((m) => m.proximity)
    .map((m) => ({
      user_id: m.user_id,
      name: m.name,
      band: BAND_FOR_PROXIMITY[m.proximity!],
      last_seen: now,
      highlight: m.highlight,
      why: m.why,
    }));
}

/** People nearby, as distance bands. Starts Bluetooth while `enabled`. */
export function useProximity(enabled: boolean): ProximityState {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineSnapshot | null>(null);

  // Radio: advertise + scan + upload. In Expo Go (no Bluetooth) mocks still work; live mode says why not.
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribe(setEngine);
    if (bleAvailable()) startEngine({ eventId: HACKGT_EVENT_ID, owner: 'nearby' });
    return () => {
      unsub();
      stopEngine('nearby');
      setEngine(null);
    };
  }, [enabled]);

  // People: the server resolves tokens and ranks matches.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false; // never stack polls on a slow server
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      api
        .matches(HACKGT_EVENT_ID)
        .then((r) => {
          if (cancelled) return;
          setPeers(toPeers(r.matches));
          setFetchError(null);
        })
        .catch((e: unknown) => !cancelled && setFetchError(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          inFlight = false;
        });
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      setPeers([]); // stopped: forget who was nearby
      setFetchError(null);
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  const radioError = !enabled ? null : !bleAvailable() ? (env.useMocks ? null : BLE_UNAVAILABLE_MESSAGE) : (engine?.error ?? null);

  return {
    scanning: enabled,
    peers,
    error: radioError ?? fetchError,
    radioError,
    fetchError,
    radio: env.useMocks ? 'demo' : bleAvailable() ? 'on' : 'off',
    heardCount: engine?.heard.length ?? 0,
  };
}

/** Start/stop advertising and scanning outside the Nearby screen. Event Mode (AK8) uses features/ble/eventMode. */
export async function setAdvertising(on: boolean): Promise<void> {
  if (on) await startEngine({ eventId: HACKGT_EVENT_ID, owner: 'app' });
  else stopEngine('app');
}
