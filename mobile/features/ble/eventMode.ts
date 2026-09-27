// AK8 Event Mode (MASTER_SPEC 7.2): while at an event, keep proximity running.
// - All platforms: keep the screen awake (iOS only scans reliably in the foreground).
// - Android: a foreground service of type connectedDevice with a persistent notification keeps the process and
//   the Bluetooth scan alive when the phone is locked (modules/event-mode). iOS has no equivalent.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { PermissionsAndroid, Platform } from 'react-native';

import { api } from '@/lib/api';
import { getCurrentEventId } from '@/lib/currentEvent';

import EventModeNative from '../../modules/event-mode/src/EventModeModule';
import { getSnapshot, startEngine, stopEngine } from './engine';
import { BLE_UNAVAILABLE_MESSAGE, bleAvailable } from './native';

const KEY = 'eventMode.on';
const TAG = 'event-mode';
const OWNER = 'event-mode';

export interface EventModeStatus {
  on: boolean;
  keepAwake: boolean;
  backgroundService: 'running' | 'unavailable' | 'failed' | 'off';
  error: string | null;
  /** True when Event Mode was refused because this person hasn't checked in with the event's QR code. */
  needsCheckIn?: boolean;
}

let status: EventModeStatus = { on: false, keepAwake: false, backgroundService: 'off', error: null };
const listeners = new Set<(s: EventModeStatus) => void>();

function set(patch: Partial<EventModeStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function subscribeEventMode(l: (s: EventModeStatus) => void): () => void {
  listeners.add(l);
  l(status);
  return () => listeners.delete(l);
}

async function startAndroidService(): Promise<EventModeStatus['backgroundService']> {
  if (Platform.OS !== 'android' || !EventModeNative) return 'unavailable';
  if (Number(Platform.Version) >= 33) {
    // Without this the service still runs, but the notification is hidden from the shade.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  await EventModeNative.start('Event Mode is on', 'Finding your matches nearby over Bluetooth. Tap to open.');
  await new Promise((r) => setTimeout(r, 400)); // startForeground happens on the service's own tick
  return EventModeNative.isRunning() ? 'running' : 'failed';
}

/** Turn Event Mode on. Bluetooth permissions are requested first (Android 14 needs them before the service). */
export async function enableEventMode(): Promise<void> {
  // Event Mode is only for people checked in at the venue. Company events check people in when a registered
  // attendee scans the organizer's QR code (app/join-event), never from here.
  const checkedIn = await api
    .listEvents()
    .then((r) => r.events.find((e) => e.id === getCurrentEventId())?.checked_in ?? false)
    .catch(() => null);
  if (checkedIn === null) {
    set({ on: false, needsCheckIn: false, error: 'Could not confirm your event check-in. Check your connection and try again.' });
    return;
  }
  if (!checkedIn) {
    set({ on: false, needsCheckIn: true, error: 'Scan the event’s QR code at the entrance to check in, then turn on Event Mode.' });
    return;
  }
  if (!bleAvailable()) {
    set({ on: false, needsCheckIn: false, error: BLE_UNAVAILABLE_MESSAGE });
    return;
  }
  set({ error: null, needsCheckIn: false });
  await startEngine({ eventId: getCurrentEventId(), owner: OWNER });
  const engine = getSnapshot();
  if (!engine.running) {
    // e.g. the server couldn't issue Bluetooth tokens. Say why instead of "Starting Bluetooth..." forever.
    stopEngine(OWNER);
    set({ on: false, error: `Bluetooth couldn't start: ${engine.error ?? 'unknown error'}. Try again.` });
    return;
  }
  await activateKeepAwakeAsync(TAG);
  let service: EventModeStatus['backgroundService'] = 'unavailable';
  try {
    service = await startAndroidService();
  } catch {
    service = 'failed';
  }
  set({
    on: true,
    keepAwake: true,
    backgroundService: service,
    error: service === 'failed' ? `Background scanning couldn't start (${EventModeNative?.lastError() ?? 'unknown'}). Keep the app open.` : null,
  });
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // remembering the choice is a convenience only
  }
}

export async function disableEventMode(): Promise<void> {
  await deactivateKeepAwake(TAG);
  if (Platform.OS === 'android' && EventModeNative) await EventModeNative.stop().catch(() => undefined);
  stopEngine(OWNER);
  set({ on: false, keepAwake: false, backgroundService: 'off', error: null });
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Was Event Mode on when the app last closed? (The UI offers to resume; it never starts silently.) */
export async function wasEventModeOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}
