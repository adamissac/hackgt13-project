// Pure helpers for the Events tab: RSVP statuses, the month calendar grid, and "near you" filtering.
// No React Native imports, so `node --experimental-strip-types --test features/events/plan.test.mjs` runs them.

export type RsvpStatus = 'attending' | 'interested' | 'not_attending';
export type RsvpMap = Record<string, RsvpStatus>;

export const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'attending', label: 'Attending' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_attending', label: 'Not attending' },
];

const STATUSES = new Set<string>(RSVP_OPTIONS.map((o) => o.value));

/** Reads stored RSVPs. The old format was a plain list of ids, which meant "attending". */
export function parseRsvps(raw: unknown, knownIds: string[]): RsvpMap {
  const known = new Set(knownIds);
  const out: RsvpMap = {};
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string' && known.has(id)) out[id] = 'attending';
  } else if (raw && typeof raw === 'object') {
    for (const [id, s] of Object.entries(raw)) if (known.has(id) && typeof s === 'string' && STATUSES.has(s)) out[id] = s as RsvpStatus;
  }
  return out;
}

/** Tapping the status you already have clears it. */
export function nextRsvps(map: RsvpMap, id: string, status: RsvpStatus): RsvpMap {
  const out = { ...map };
  if (out[id] === status) delete out[id];
  else out[id] = status;
  return out;
}

/** Only these show on the calendar. */
export const isPlanned = (s: RsvpStatus | undefined) => s === 'attending' || s === 'interested';

const TZ = 'America/New_York';

/** YYYY-MM-DD of an instant, in the events' time zone. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Weeks (Sunday first) for a month; days outside it are null. month is 1-12. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export interface Point {
  lat: number;
  lng: number;
}

export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Events within radiusKm of the user, closest first. */
export function eventsNear<T extends Point>(events: T[], me: Point, radiusKm = 40): (T & { km: number })[] {
  return events
    .map((e) => ({ ...e, km: distanceKm(me, e) }))
    .filter((e) => e.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

export function milesLabel(km: number): string {
  const mi = km * 0.621371;
  return mi < 0.2 ? 'Right by you' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`;
}
