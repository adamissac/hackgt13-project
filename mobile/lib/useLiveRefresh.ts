import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

/** Quiet cross-device refresh. Only the visible, foreground screen polls,
 * and the next request starts after the previous one settles. */
export function useLiveRefresh(refresh: () => Promise<unknown>, intervalMs = 2000) {
  useFocusEffect(useCallback(() => {
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (disposed || running || AppState.currentState !== 'active') return;
      running = true;
      try { await refresh(); } catch { /* The data hook owns errors and retains last good data. */ }
      finally {
        running = false;
        if (!disposed && AppState.currentState === 'active') timer = setTimeout(tick, intervalMs);
      }
    };
    void tick();
    const listener = AppState.addEventListener('change', state => {
      clearTimeout(timer);
      if (state === 'active') void tick();
    });
    return () => { disposed = true; clearTimeout(timer); listener.remove(); };
  }, [refresh, intervalMs]));
}
