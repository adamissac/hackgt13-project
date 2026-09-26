// Bluetooth proximity: Akshar owns this folder (MASTER_SPEC 7, task AK1+).
// This stub lets the Home and Nearby tabs compile and render before the native module lands.
// Replace the internals; keep the exported shapes, or update the screens that use them.

import { useEffect, useState } from 'react';

// Distances are shown as bands, never meters.
export type DistanceBand = 'very close' | 'nearby' | 'farther away';

export interface Peer {
  user_id: string;
  name: string;
  band: DistanceBand;
  last_seen: string;
}

export interface ProximityState {
  scanning: boolean;
  peers: Peer[];
  error: string | null;
}

const MOCK_PEERS: Peer[] = [
  { user_id: '00000000-0000-0000-0000-000000000101', name: 'Maya R.', band: 'very close', last_seen: new Date().toISOString() },
  { user_id: '00000000-0000-0000-0000-000000000103', name: 'Priya S.', band: 'nearby', last_seen: new Date().toISOString() },
];

/** Peers the phone currently hears over Bluetooth. Stub: returns mock peers when enabled. */
export function useProximity(enabled: boolean): ProximityState {
  const [state, setState] = useState<ProximityState>({ scanning: false, peers: [], error: null });

  useEffect(() => {
    if (!enabled) {
      setState({ scanning: false, peers: [], error: null });
      return;
    }
    setState({ scanning: true, peers: [], error: null });
    const t = setTimeout(() => setState({ scanning: true, peers: MOCK_PEERS, error: null }), 800);
    return () => clearTimeout(t);
  }, [enabled]);

  return state;
}

/** Start/stop advertising this phone's rotating ephemeral ID. Stub: no-op. */
export async function setAdvertising(_on: boolean): Promise<void> {}
