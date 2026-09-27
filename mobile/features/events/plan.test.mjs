// Run: cd mobile && node --experimental-strip-types --test features/events/plan.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayKey, eventDays, eventsNear, isPlanned, milesLabel, monthGrid, nextRsvps, parseRsvps, shiftMonth } from './plan.ts';

test('old RSVP list becomes attending; unknown ids and bad statuses are dropped', () => {
  assert.deepEqual(parseRsvps(['a', 'zzz', 3], ['a', 'b']), { a: 'attending' });
  assert.deepEqual(parseRsvps({ a: 'interested', b: 'maybe', c: 'attending' }, ['a', 'b']), { a: 'interested' });
  assert.deepEqual(parseRsvps(null, ['a']), {});
});

test('choosing the same status again clears it', () => {
  const m = nextRsvps({}, 'a', 'attending');
  assert.deepEqual(m, { a: 'attending' });
  assert.deepEqual(nextRsvps(m, 'a', 'interested'), { a: 'interested' });
  assert.deepEqual(nextRsvps(m, 'a', 'attending'), {});
  assert.equal(isPlanned('not_attending'), false);
  assert.equal(isPlanned('interested'), true);
});

test('September 2026 starts on a Tuesday and has 30 days', () => {
  const weeks = monthGrid(2026, 9);
  assert.deepEqual(weeks[0].slice(0, 3), [null, null, '2026-09-01']);
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.ok(weeks.every((w) => w.length === 7));
});

test('month shifting wraps years', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
});

test('day keys use Atlanta time, so a late-evening event stays on its own day', () => {
  assert.equal(dayKey('2026-10-01T22:30:00-04:00'), '2026-10-01');
});

test('near filter keeps events in radius, closest first', () => {
  const me = { lat: 33.7756, lng: -84.3963 }; // Georgia Tech
  const events = [
    { id: 'decatur', lat: 33.7748, lng: -84.2963 },
    { id: 'campus', lat: 33.7766, lng: -84.3893 },
    { id: 'savannah', lat: 32.0809, lng: -81.0912 },
  ];
  const near = eventsNear(events, me);
  assert.deepEqual(near.map((e) => e.id), ['campus', 'decatur']);
  assert.match(milesLabel(near[1].km), /^5\.\d mi away$/);
});

test('day keys follow the event city, so a late San Francisco event stays on its local day', () => {
  assert.equal(dayKey('2026-11-05T22:00:00-08:00', 'America/Los_Angeles'), '2026-11-05');
  assert.equal(dayKey('2026-11-05T22:00:00-08:00'), '2026-11-06');
});

test('event days: all-day event is one day; multi-day spans each day; midnight end stays put', () => {
  assert.deepEqual(eventDays('2026-09-27T00:00:00-04:00', '2026-09-27T23:59:00-04:00'), ['2026-09-27']);
  assert.deepEqual(eventDays('2026-09-27T18:00:00-04:00'), ['2026-09-27']);
  assert.deepEqual(eventDays('2026-09-30T22:00:00-04:00', '2026-10-01T00:00:00-04:00'), ['2026-09-30']);
  const veeva = eventDays('2026-09-20T00:00:00-04:00', '2026-10-20T23:59:00-04:00');
  assert.equal(veeva[0], '2026-09-20');
  assert.equal(veeva.at(-1), '2026-10-20');
  assert.equal(veeva.length, 31);
});
