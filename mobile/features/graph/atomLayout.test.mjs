import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atomLayout } from './atomLayout.ts';

test('phone and tablet layouts keep targets and labels in bounds and separate', () => {
  for (const width of [286, 326, 356, 396, 440]) {
    const { nodes, height, center } = atomLayout(width, 6);
    for (const [i, n] of nodes.entries()) {
      assert.ok(n.x - 45 >= 0 && n.x + 45 <= width);
      assert.ok(n.y - 24 >= 0 && n.y + 52 <= height);
      assert.ok(Math.hypot(n.x - center.x, n.y - center.y) > 72);
      for (const other of nodes.slice(i + 1)) {
        assert.ok(Math.abs(n.x - other.x) >= 90 || Math.abs(n.y - other.y) >= 76, `overlap at ${width}`);
      }
    }
  }
});
test('zero, sparse and excess populations stay bounded', () => {
  for (const count of [0, 1, 3, 6, 12]) assert.equal(atomLayout(326, count).nodes.length, Math.min(count, 6));
});
