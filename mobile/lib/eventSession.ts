// "In an event" mode. Scanning a company's QR code puts the whole app inside that event: the current event becomes
// that event (so Home, Nearby, Constellation, matches and the assistant only show people who registered and scanned
// in), and Event Mode (Bluetooth) turns on, because scanning in is the attendee's consent to proximity for
// connecting. Leaving (confirmed) checks out on the server, turns Event Mode off, and returns to the general space.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { disableEventMode, enableEventMode } from '@/features/ble/eventMode';

import { api } from './api';
import { HACKGT_EVENT_ID } from './constants';
import { setCurrentEventId } from './currentEvent';

export interface EventSession {
  eventId: number;
  name: string;
  endsAt: string | null;
}

const KEY = 'fc.event-session';
let session: EventSession | null = null;
let loaded = false;
const listeners = new Set<(s: EventSession | null) => void>();

function publish(next: EventSession | null) {
  session = next;
  listeners.forEach((l) => l(next));
  (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
}

async function load(): Promise<EventSession | null> {
  if (loaded) return session;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    session = raw ? (JSON.parse(raw) as EventSession) : null;
  } catch {
    session = null;
  }
  return session;
}

export const getEventSession = () => session;

/** After a successful QR / join-code check-in. */
export async function enterEventSession(eventId: number, name: string, endsAt: string | null): Promise<void> {
  await setCurrentEventId(eventId);
  publish({ eventId, name, endsAt });
  void enableEventMode().catch(() => undefined);
}

/** Leave (after the user confirms): check out, stop Bluetooth, back to the general space with everyone. */
export async function leaveEventSession(): Promise<void> {
  const s = session;
  await disableEventMode().catch(() => undefined);
  if (s) await api.leaveEvent(s.eventId).catch(() => undefined);
  await setCurrentEventId(HACKGT_EVENT_ID);
  await api.checkin(HACKGT_EVENT_ID).catch(() => undefined);
  publish(null);
}

/** Forget the session without calling the server (e.g. the server says you're no longer checked in). */
export function clearEventSession(): void {
  publish(null);
}

export function useEventSession(): EventSession | null {
  const [s, setS] = useState<EventSession | null>(session);
  useEffect(() => {
    listeners.add(setS);
    void load().then(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
