// Georgia Tech career events from Handshake, copied from the student events page on 2026-09-26.
// This is a snapshot, not a live feed: Handshake has no public API for student apps. To refresh,
// paste the Handshake events page again and regenerate the list below. Only fields Handshake showed
// are used (employer, title, start time, format, tags); room, end time, and details live on Handshake.
// Non-career listings are left out. RSVPs here stay on this device; register on Handshake itself.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LiveEvent } from '@/lib/api';

import { parseRsvps, type RsvpMap } from './plan';

export type EventCategory = 'Company event' | 'Info session' | 'Networking' | 'Workshop' | 'Club meeting';
export interface NetworkingEvent {
 id: string; name: string; host: string; category: EventCategory; tags: string[];
 startsAt: string; endsAt?: string; allDay?: boolean; tz: string;
 format: 'in_person' | 'virtual'; location: string; lat?: number; lng?: number; url: string;
 /** Set for events a company created in the app: register here, then scan the company's QR at the venue. */
 companyEventId?: number; registered?: boolean; checkedIn?: boolean;
 /** No date set by the company yet (never placed on the calendar). */
 dateless?: boolean;
}
export const CATEGORIES: EventCategory[] = ['Company event', 'Info session', 'Networking', 'Workshop', 'Club meeting'];

/** A company event from GET /events, shaped like the catalog so it lists and calendars the same way. */
export function fromLiveEvent(e: LiveEvent): NetworkingEvent {
 return {
  id: `co-${e.id}`, name: e.name, host: e.host || 'Company event', category: 'Company event', tags: ['Company event'],
  startsAt: e.starts_at ?? '', endsAt: e.ends_at ?? undefined, dateless: !e.starts_at, tz: ATL, format: 'in_person',
  location: e.location || 'Location on site', url: '', companyEventId: e.id, registered: e.registered, checkedIn: e.checked_in,
 };
}

const ATL = 'America/New_York';
const GT = { lat: 33.7756, lng: -84.3963 };
const COC = 'Georgia Tech College of Computing';
const TAG: Record<string, string> = { H: 'Hiring', E: 'Employer info', G: 'Career guidance', N: 'Networking', X: 'General' };

// [Handshake id, host, title, category, tags (H/E/G/N/X), start in Atlanta time]
const rows: [number, string, string, EventCategory, string, string][] = [
 [2006711, 'Bloomberg', 'Women @ CC & SHPE Host Bloomberg', 'Networking', 'EN', '2026-09-28T17:00'],
 [2026548, COC, 'Sequence Holdings/BankSouth Info Session', 'Info session', 'G', '2026-09-28T17:00'],
 [2025285, COC, 'JPMorgan Chase Investment Banking Recruiting Kick-Off', 'Info session', 'G', '2026-09-28T18:00'],
 [2019641, 'Roblox', 'Roblox Assessment Prep: Kaiju Cats', 'Workshop', 'G', '2026-09-29T10:00'],
 [2025519, 'American Express', 'Inside Tech at American Express', 'Info session', 'HE', '2026-09-29T14:00'],
 [2025518, 'American Express', 'An Evening with American Express', 'Networking', 'HE', '2026-09-29T17:00'],
 [2017526, 'American Express', 'Inside American Express: Careers & Conversations', 'Info session', 'EG', '2026-09-29T17:15'],
 [2003589, COC, 'Big Data Bi-Weekly Meeting (Tue)', 'Club meeting', 'NX', '2026-09-29T18:30'],
 [1990191, COC, 'Evaluating & Negotiating Offers', 'Workshop', 'G', '2026-09-30T11:00'],
 [2019647, 'Roblox', 'Roblox Large Scale Tech Talk Event: Innovation Spotlight', 'Info session', 'E', '2026-09-30T17:30'],
 [1983666, COC, 'Entrepreneurship & Innovation Workshop Series', 'Workshop', 'G', '2026-09-30T18:00'],
 [2026544, COC, 'Verkada PhD Lunch @ GT', 'Networking', 'G', '2026-10-01T12:00'],
 [2027049, COC, 'Avanos Health - Coffee Chats', 'Networking', 'G', '2026-10-01T13:00'],
 [2027623, COC, 'Verkada Tech Talk @ GT (Info Session)', 'Info session', 'G', '2026-10-01T17:30'],
 [2027252, 'Equifax', 'BDBI x Equifax', 'Networking', 'EN', '2026-10-01T18:30'],
 [2003902, COC, 'Big Data Bi-Weekly Meeting (Thu)', 'Club meeting', 'NX', '2026-10-01T18:30'],
 [1997903, 'Salesforce', 'Salesforce Futureforce Info Session - FT and Internships', 'Info session', 'H', '2026-10-07T11:00'],
 [1983688, COC, 'Entrepreneurship & Innovation Workshop Series', 'Workshop', 'G', '2026-10-07T18:00'],
 [1990641, COC, 'COC Catalyst x IRP Writing and Speaking w/ Workplace Clarity', 'Workshop', 'GX', '2026-10-08T15:00'],
 [2027975, 'Advanced Micro Devices', 'Supercomputing x AMD', 'Networking', 'EN', '2026-10-08T17:00'],
 [2003908, COC, 'Big Data Bi-Weekly Meeting (Thu)', 'Club meeting', 'G', '2026-10-08T18:30'],
 [1983603, COC, 'Conversations with Alumni', 'Networking', 'N', '2026-10-09T11:00'],
 [2026985, COC, 'Morgan Stanley - MS Technology Info Session', 'Info session', 'G', '2026-10-12T11:00'],
 [2027164, 'Google', 'Google Technical Interview Workshop', 'Workshop', 'G', '2026-10-12T17:00'],
 [2003620, COC, 'Big Data Bi-Weekly Meeting (Tue)', 'Club meeting', 'NX', '2026-10-13T18:30'],
 [2022550, 'Voloridge Investment Management', 'Get to Know Voloridge Investment Management', 'Info session', 'HE', '2026-10-14T11:30'],
 [1983713, COC, 'Entrepreneurship & Innovation Workshop Series', 'Workshop', 'G', '2026-10-14T18:00'],
 [2003910, COC, 'Big Data Bi-Weekly Meeting (Thu)', 'Club meeting', 'NX', '2026-10-15T18:30'],
];

const url = (id: number) => `https://gatech.joinhandshake.com/stu/events/${id}`;
export const handshakeEvents: NetworkingEvent[] = [
 // Virtual and multi-day, so it has no place on the map and no single start time.
 { id: 'hs-2015596', name: "Learn from Local MA Legends! Info Session and Panel with some of Veeva's Engineers", host: 'Veeva Systems', category: 'Info session', tags: [TAG.H, TAG.E],
   startsAt: '2026-09-20T00:00:00-04:00', endsAt: '2026-10-20T23:59:00-04:00', allDay: true, tz: ATL, format: 'virtual', location: 'Virtual', url: url(2015596) },
 ...rows.map(([id, host, name, category, tags, start]): NetworkingEvent => ({
   id: `hs-${id}`, name, host, category, tags: [...tags].map((t) => TAG[t]),
   startsAt: `${start}:00-04:00`, tz: ATL, format: 'in_person', location: 'Georgia Tech campus · Atlanta', ...GT, url: url(id),
 })),
];

const legacyKey = (scope: string) => `constellation:event-rsvps:v1:${scope}`;
const key = (scope: string) => `constellation:event-rsvps:v2:${scope}`;
const ids = handshakeEvents.map((e) => e.id);
export const eventCatalog = {
 list: async () => handshakeEvents,
 rsvps: async (scope: string): Promise<RsvpMap> => {
  const raw = (await AsyncStorage.getItem(key(scope))) ?? (await AsyncStorage.getItem(legacyKey(scope)));
  if (!raw) return {};
  try { return parseRsvps(JSON.parse(raw), ids); } catch { return {}; }
 },
 saveRsvps: async (scope: string, map: RsvpMap) => AsyncStorage.setItem(key(scope), JSON.stringify(map)),
};
export function eventDate(iso: string, tz = ATL) {
 return new Date(iso).toLocaleDateString('en-US', {month:'short',day:'numeric',timeZone:tz});
}
export function eventTime(iso: string, tz = ATL) {
 return new Date(iso).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit',timeZone:tz});
}
/** "ET", "CT", "PT": short zone name for the event's own city. */
export function zoneLabel(iso: string, tz = ATL) {
 const name = new Intl.DateTimeFormat('en-US', {timeZone:tz, timeZoneName:'short'}).formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName')?.value ?? '';
 return name.replace(/^([A-Z])[DS]T$/, '$1T');
}
/** "Tue, Sep 29 · 5:00 PM ET", or a date range for multi-day events. */
export function whenLabel(e: NetworkingEvent) {
 if (e.dateless) return 'Date to be announced';
 if (e.allDay) {
  const start = eventDate(e.startsAt, e.tz), end = e.endsAt ? eventDate(e.endsAt, e.tz) : start;
  return start === end ? `All day · ${start}` : `${start} – ${end}`;
 }
 const weekday = new Date(e.startsAt).toLocaleDateString('en-US', {weekday:'short', timeZone:e.tz});
 // Same-day end time: "Sun, Sep 27 · 12:00 AM – 11:59 PM ET"
 const until = e.endsAt && eventDate(e.endsAt, e.tz) === eventDate(e.startsAt, e.tz) ? ` – ${eventTime(e.endsAt, e.tz)}` : '';
 return `${weekday}, ${eventDate(e.startsAt, e.tz)} · ${eventTime(e.startsAt, e.tz)}${until} ${zoneLabel(e.startsAt, e.tz)}`;
}
