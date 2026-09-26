// Open to Meet, shared by Home and Nearby (MASTER_SPEC 3.3). Stored on the server profile
// (PATCH /me/open-to-meet), so it's the same on every screen and survives a reload. Turning it ON
// also checks you in to the event so matching can include you; OFF ends live location sharing.
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { onChange } from '@/lib/changes';
import { HACKGT_EVENT_ID } from '@/lib/constants';

type Status = 'loading' | 'on' | 'off' | 'saving';
let current: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

function set(on: boolean) {
  current = on;
  listeners.forEach((l) => l(on));
}

async function load() {
  try {
    set((await api.getOpenToMeet()).open_to_meet);
  } catch {
    if (current === null) set(false);
  }
}

onChange((topic) => topic === 'profile' && void load());

export function useOpenToMeet() {
  const [on, setOn] = useState<boolean | null>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setOn);
    if (current === null) void load();
    return () => void listeners.delete(setOn);
  }, []);

  const toggle = async (next: boolean) => {
    if (saving) return;
    const prev = current ?? false;
    set(next);
    setSaving(true);
    setError(null);
    try {
      if (next) await api.checkin(HACKGT_EVENT_ID).catch(() => undefined);
      set((await api.setOpenToMeet(next)).open_to_meet);
    } catch (e) {
      set(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const status: Status = on === null ? 'loading' : saving ? 'saving' : on ? 'on' : 'off';
  return { on: Boolean(on), status, toggle, error };
}
