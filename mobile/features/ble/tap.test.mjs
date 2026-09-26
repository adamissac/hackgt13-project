// Run: cd mobile && node --experimental-strip-types --test features/ble/tap.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TapDetector } from './tap.ts';

test('claims only after 2 s at touching range', () => {
  const d = new TapDetector();
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -40 }], 0).token, null);
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -42 }], 1000).progress, 0.5);
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -41 }], 2000).token, 'aaaaaaaa');
});

test('pulling apart resets the hold', () => {
  const d = new TapDetector();
  d.update([{ token: 'aaaaaaaa', rssi: -40 }], 0);
  d.update([{ token: 'aaaaaaaa', rssi: -70 }], 1500);
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -40 }], 2500).token, null);
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -40 }], 4500).token, 'aaaaaaaa');
});

test('picks the strongest phone and restarts if it changes', () => {
  const d = new TapDetector();
  d.update([{ token: 'aaaaaaaa', rssi: -45 }, { token: 'bbbbbbbb', rssi: -70 }], 0);
  d.update([{ token: 'bbbbbbbb', rssi: -35 }, { token: 'aaaaaaaa', rssi: -66 }], 1000);
  assert.equal(d.update([{ token: 'bbbbbbbb', rssi: -35 }], 2500).token, null);
  assert.equal(d.update([{ token: 'bbbbbbbb', rssi: -35 }], 3000).token, 'bbbbbbbb');
});

test('charging port to port (~-55 dBm) counts; 30 cm (~-62) does not', () => {
  const d = new TapDetector();
  d.update([{ token: 'aaaaaaaa', rssi: -55 }], 0);
  assert.equal(d.update([{ token: 'aaaaaaaa', rssi: -56 }], 2000).token, 'aaaaaaaa');
  const far = new TapDetector();
  far.update([{ token: 'aaaaaaaa', rssi: -62 }], 0);
  assert.equal(far.update([{ token: 'aaaaaaaa', rssi: -62 }], 3000).token, null);
});

test('nothing heard means no progress', () => {
  assert.deepEqual(new TapDetector().update([], 0), { token: null, rssi: null, progress: 0 });
});
