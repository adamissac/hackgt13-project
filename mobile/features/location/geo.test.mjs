// Run: cd mobile && node --experimental-strip-types --test features/location/geo.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { arrowDeg, bearingDeg, compassWord, distanceBand, distanceM } from './geo.ts';

const culc = { lat: 33.77464, lng: -84.39642 };
const studentCenter = { lat: 33.77395, lng: -84.39825 };

test('distance between two campus buildings is ~185 m', () => {
  const d = distanceM(culc, studentCenter);
  assert.ok(d > 170 && d < 200, `got ${d}`);
  assert.equal(distanceM(culc, culc), 0);
});

test('bearing: due north is 0, due east is 90', () => {
  assert.ok(Math.abs(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })) < 1e-9);
  assert.ok(Math.abs(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 90) < 1e-9);
  assert.equal(compassWord(bearingDeg(culc, studentCenter)), 'southwest');
});

test('arrow is relative to where the phone points', () => {
  assert.equal(arrowDeg(90, 90), 0);
  assert.equal(arrowDeg(10, 350), 20);
  assert.equal(arrowDeg(350, 10), 340);
  assert.equal(arrowDeg(45, null), 45);
});

test('bands never show meters', () => {
  for (const m of [0, 5, 19, 20, 59, 60, 149, 150, 399, 400, 5000]) {
    assert.doesNotMatch(distanceBand(m).label, /\d+\s*m\b/);
  }
  assert.equal(distanceBand(10).close, true);
  assert.equal(distanceBand(30).close, false);
});
