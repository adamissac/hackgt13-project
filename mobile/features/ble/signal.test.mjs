// Run: cd mobile && node --experimental-strip-types --test features/ble/signal.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RssiFilter, bandForRssi, estimateDistanceM } from './signal.ts';

test('bands follow MASTER_SPEC 7.3 thresholds', () => {
  assert.equal(bandForRssi(-50), 'very close');
  assert.equal(bandForRssi(-60), 'nearby');
  assert.equal(bandForRssi(-75), 'nearby');
  assert.equal(bandForRssi(-76), 'farther away');
});

test('distance formula is ~1 m at -59 dBm', () => {
  assert.ok(Math.abs(estimateDistanceM(-59) - 1) < 1e-9);
});

test('median rejects a single spike', () => {
  const f = new RssiFilter();
  for (let i = 0; i < 10; i++) f.update(i * 200, -60);
  const before = f.value;
  f.update(2000, -20); // one reflection spike
  assert.ok(Math.abs(f.value - before) < 1, `spike moved estimate to ${f.value}`);
});

test('converges to a new level and smooths noise', () => {
  const f = new RssiFilter();
  let t = 0;
  for (let i = 0; i < 50; i++) f.update((t += 200), -80 + (i % 2 ? 6 : -6));
  assert.ok(Math.abs(f.value + 80) < 2, `noisy -80 settled at ${f.value}`);
  for (let i = 0; i < 150; i++) f.update((t += 200), -55);
  assert.ok(Math.abs(f.value + 55) < 2, `step to -55 settled at ${f.value}`);
  assert.equal(bandForRssi(f.value), 'very close');
});

test('median window drops readings older than 5 s', () => {
  const f = new RssiFilter(100, 0.01); // near pass-through so the median is visible
  f.update(0, -90);
  f.update(100, -90);
  f.update(6000, -50);
  assert.ok(Math.abs(f.value + 50) < 1, `old readings leaked: ${f.value}`);
});
