import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atomLayout } from './atomLayout.ts';

test('phone and tablet layouts keep targets and labels in bounds and separate', () => {
  for (const width of [286, 326, 356, 396, 440]) {
    const { nodes, height, center } = atomLayout(width, 6);
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const a = degrees * Math.PI / 180;
      const rotated = nodes.map(n => ({
        x: center.x + (n.x - center.x) * Math.cos(a) - (n.y - center.y) * Math.sin(a),
        y: center.y + (n.x - center.x) * Math.sin(a) + (n.y - center.y) * Math.cos(a),
      }));
    for (const [i, n] of rotated.entries()) {
      assert.ok(n.x - 36 >= 0 && n.x + 36 <= width, `clipped at ${width}/${degrees}`);
      assert.ok(n.y - 34 >= 0 && n.y + 34 <= height);
      assert.ok(Math.hypot(n.x - center.x, n.y - center.y) > 72);
      for (const other of rotated.slice(i + 1)) {
        assert.ok(Math.abs(n.x - other.x) >= 72 || Math.abs(n.y - other.y) >= 68, `overlap at ${width}/${degrees}`);
      }
    }
    }
  }
});
test('zero, sparse and excess populations stay bounded', () => {
  for (const count of [0, 1, 3, 6, 12]) assert.equal(atomLayout(326, count).nodes.length, Math.min(count, 6));
});
