// The user's area for "Near you" events. Tracks position while the Events tab is using it, with coarse
// accuracy and a 1 km update step. Coordinates stay on this phone: nothing here is uploaded.
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Point } from './plan';

export type AreaState =
  | { status: 'idle' | 'asking' }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'error'; message: string }
  | { status: 'ready'; point: Point; place: string | null };

export function useArea(active: boolean) {
  const [area, setArea] = useState<AreaState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const update = async (coords: { latitude: number; longitude: number }) => {
      const point = { lat: coords.latitude, lng: coords.longitude };
      let place: string | null = null;
      try {
        const [a] = await Location.reverseGeocodeAsync(coords);
        place = [a?.city ?? a?.subregion, a?.region].filter(Boolean).join(', ') || null;
      } catch {
        // Area name is a nicety; distances still work without it.
      }
      if (!cancelled) setArea({ status: 'ready', point, place });
    };
    (async () => {
      setArea((s) => (s.status === 'ready' ? s : { status: 'asking' }));
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setArea({ status: 'denied', canAskAgain: perm.canAskAgain });
        return;
      }
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) await update(last.coords);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Low, distanceInterval: 1000 }, (p) => {
        void update(p.coords);
      });
      if (cancelled) sub.remove();
    })().catch(() => {
      if (!cancelled) setArea({ status: 'error', message: 'Could not find your location. Try again.' });
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, attempt]);

  return { area, retry };
}
