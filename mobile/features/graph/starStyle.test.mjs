import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starSize } from './starStyle.ts';

test('strong matches have visibly larger stars within the readable node envelope', () => {
  assert.ok(starSize(.97) > starSize(.1) * 2);
  for (const score of [-1, 0, .1, .5, .97, 1, 2, NaN]) {
    assert.ok(starSize(score) >= 16 && starSize(score) <= 44);
  }
  assert.ok(starSize(.1) < starSize(.5) && starSize(.5) < starSize(.97));
});
