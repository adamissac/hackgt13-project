/**
 * Light / dark / follow-system, persisted.
 *
 * An external store rather than a React context: `useColorScheme()` is imported directly by
 * Themed.tsx, ui.tsx, _layout.tsx and the graph screen, so a context would mean mounting a
 * provider above all of them and threading it through. useSyncExternalStore keeps the existing
 * import shape working and re-renders every consumer on change.
 *
 * Three states, not two: once someone picks light or dark there has to be a way back to following
 * the phone, which is what most people actually want.
 */
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearanceChoice = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

const KEY = 'fc.appearance';

let choice: AppearanceChoice = 'system';
let systemScheme: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// The OS setting can change while the app is open (and at sunset, on a schedule).
Appearance.addChangeListener(({ colorScheme }) => {
  systemScheme = colorScheme === 'dark' ? 'dark' : 'light';
  if (choice === 'system') emit();
});

/** Load the saved choice once at startup. Until it resolves we follow the system, which is the
 *  same thing the majority of users have chosen anyway, so the worst case is a brief correction. */
export async function loadAppearance(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') {
      choice = v;
      emit();
    }
  } catch {
    /* keep following the system */
  }
}

export function setAppearance(next: AppearanceChoice): void {
  choice = next;
  emit();
  AsyncStorage.setItem(KEY, next).catch(() => undefined);   // choice still applies this session
}

export function getAppearance(): AppearanceChoice {
  return choice;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function schemeSnapshot(): Scheme {
  return choice === 'system' ? systemScheme : choice;
}

/** The scheme to paint right now. */
export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, schemeSnapshot, schemeSnapshot);
}

/** The user's setting (including 'system'), plus a setter, for the appearance picker. */
export function useAppearanceChoice(): [AppearanceChoice, (c: AppearanceChoice) => void] {
  const c = useSyncExternalStore(subscribe, getAppearance, getAppearance);
  return [c, setAppearance];
}
