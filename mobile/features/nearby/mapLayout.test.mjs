import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as layout from './geo.ts';

test('crowded bands are capped and a selected person is never hidden', () => {
  assert.equal(typeof layout.mapPreview, 'function');
  const peers = Array.from({ length: 30 }, (_, i) => ({ user_id: String(i), band: ['very close', 'nearby', 'farther away'][i % 3] }));
  const preview = layout.mapPreview(peers, '29');
  assert.equal(preview.length, 9);
  assert.ok(preview.some(p => p.user_id === '29'));
  assert.equal(new Set(preview.map(p => p.user_id)).size, 9);
  for (const band of layout.BANDS) assert.equal(preview.filter(p => p.band === band).length, 3);
  assert.equal(peers.length, 30);
  assert.deepEqual(layout.mapPreview([], null), []);
});

test('pins within a band are evenly separated regardless of API ordering', () => {
  assert.equal(typeof layout.bandAngle, 'function');
  const peers = ['a', 'b', 'c'].map(user_id => ({ user_id, band: 'nearby' }));
  const angles = peers.map(p => layout.bandAngle(p, peers));
  assert.ok(Math.abs(angles[1] - angles[0] - 2 * Math.PI / 3) < 0.0001);
  assert.equal(layout.bandAngle(peers[0], peers), layout.bandAngle(peers[0], [...peers].reverse()));
});
