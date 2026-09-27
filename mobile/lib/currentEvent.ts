import AsyncStorage from '@react-native-async-storage/async-storage';

import { HACKGT_EVENT_ID } from './constants';

const KEY = 'fc.current-event-id';
let current = HACKGT_EVENT_ID;
const listeners = new Set<(id: number) => void>();

export function getCurrentEventId(): number {
  return current;
}

export function onCurrentEventChange(listener: (id: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadCurrentEvent(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const id = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && id > 0) current = id;
  } catch {
    // keep default
  }
  return current;
}

export async function setCurrentEventId(id: number): Promise<void> {
  if (current === id) return;
  current = id;
  listeners.forEach((l) => l(id));
  try {
    await AsyncStorage.setItem(KEY, String(id));
  } catch {
    // still used in memory this session
  }
}
