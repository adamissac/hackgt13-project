// Run: cd mobile && node --experimental-strip-types --test features/checklist/met.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { metLine } from './met.ts';

test('how you met names the place and never a connection count', () => {
  assert.equal(metLine({ how_met: 'in_person', met_at: 'HackGT 13' }), 'In person at HackGT 13');
  assert.equal(metLine({ how_met: 'invite', met_at: null }), 'Through a private invite');
  assert.equal(metLine({ met_at: 'HackGT 13' }), 'Met at HackGT 13');
  assert.equal('count' in { line: metLine({ how_met: 'in_person', met_at: 'HackGT 13' }) }, false);
});
