import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atomLayout } from './atomLayout.ts';

test('projected nodes stay on screen and labels remain separate through a full orbit', () => {
  for (const width of [286, 326, 356, 396, 440]) {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      for (let degrees = 0; degrees <= 360; degrees += 5) {
        const { nodes, height, center } = atomLayout(width, count, degrees / 360);
        for (const [i, n] of nodes.entries()) {
          assert.ok(Number.isFinite(n.depth), 'nodes must have actual projected depth');
          assert.ok(n.x - 32 * n.scale >= 0 && n.x + 32 * n.scale <= width, `clipped at ${width}/${degrees}`);
          assert.ok(n.y - 32 * n.scale >= 0 && n.y + 32 * n.scale <= height);
          assert.ok(Math.hypot(n.x - center.x, n.y - center.y) > 72);
          for (const other of nodes.slice(i + 1)) {
            const scale = (n.scale + other.scale) / 2;
            assert.ok(Math.abs(n.x - other.x) >= 56 * scale || Math.abs(n.y - other.y) >= 64 * scale, `label overlap at ${width}/${degrees}/${count}`);
          }
        }
      }
    }
  }
});
test('depth changes size and opacity while the orbit closes without a jump', () => {
  const back = atomLayout(356, 1, 0).nodes[0];
  const front = atomLayout(356, 1, 0.5).nodes[0];
  const end = atomLayout(356, 1, 1).nodes[0];
  assert.ok(front.depth > back.depth);
  assert.ok(front.scale > back.scale);
  assert.ok(front.opacity > back.opacity);
  assert.ok(Math.abs(end.x - back.x) < 0.001 && Math.abs(end.y - back.y) < 0.001);
  assert.ok(Math.abs(end.angle - back.angle - 360) < 0.001, 'tether rotation must be continuous');
});
test('zero, sparse and excess populations stay bounded', () => {
  for (const count of [0, 1, 3, 6, 12]) assert.equal(atomLayout(326, count).nodes.length, Math.min(count, 6));
});
