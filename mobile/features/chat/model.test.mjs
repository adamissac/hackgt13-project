// Run: cd mobile && node --experimental-strip-types --test features/chat/model.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendMessage, isSuggestedOpener, latestByChat, otherParticipant, toSummary, visibleChats } from './model.ts';

const me = '00000000-0000-0000-0000-00000000000a';
const maya = '00000000-0000-0000-0000-000000000101';
const stranger = '00000000-0000-0000-0000-0000000000ff';

const mine = {
  id: 7,
  user_a: me,
  user_b: maya,
  origin: 'suggestion',
  created_at: '2026-09-26T12:00:00Z',
};
const notMine = {
  id: 8,
  user_a: maya,
  user_b: stranger,
  origin: 'connection',
  created_at: '2026-09-26T12:05:00Z',
};

test('only the other participant is returned, and strangers are dropped', () => {
  assert.equal(otherParticipant(mine, me), maya);
  assert.equal(otherParticipant({ user_a: maya, user_b: me }, me), maya);
  assert.equal(otherParticipant(notMine, me), null);
  const visible = visibleChats([mine, notMine], me);
  assert.deepEqual(visible.map((row) => row.id), [7]);
});

test('a summary names the other person and has no connection count', () => {
  const summary = toSummary(mine, me, new Map([[maya, 'Maya R.']]), { body: 'hi', created_at: '2026-09-26T12:01:00Z' });
  assert.ok(summary);
  assert.equal(summary.other_name, 'Maya R.');
  assert.equal(summary.last_body, 'hi');
  assert.equal('connection_count' in summary, false);
  assert.equal(toSummary(notMine, me, new Map(), null), null);
  assert.equal(toSummary(mine, me, new Map(), null)?.other_name, 'Someone');
});

test('latest message wins per chat', () => {
  const latest = latestByChat([
    { chat_id: 7, body: 'older', created_at: '2026-09-26T12:00:00Z' },
    { chat_id: 7, body: 'newer', created_at: '2026-09-26T12:02:00Z' },
    { chat_id: 9, body: 'only', created_at: '2026-09-26T11:00:00Z' },
  ]);
  assert.equal(latest.get(7)?.body, 'newer');
  assert.equal(latest.get(9)?.body, 'only');
});

test('append ignores the realtime echo of a message we just sent', () => {
  const first = {
    id: 1,
    chat_id: 7,
    sender_id: me,
    body: 'hi',
    is_ai_draft: false,
    created_at: '2026-09-26T12:02:00Z',
  };
  const second = { ...first, id: 2, body: 'again', created_at: '2026-09-26T12:01:00Z' };
  const once = appendMessage([first], first);
  assert.equal(once.length, 1);
  const both = appendMessage([first], second);
  assert.deepEqual(both.map((message) => message.id), [2, 1]);
});

test('an edited icebreaker is no longer an AI draft', () => {
  const opener = 'Ask how they backtest their RL agent.';
  assert.equal(isSuggestedOpener(opener, opener), true);
  assert.equal(isSuggestedOpener(`  ${opener}  `, opener), true);
  assert.equal(isSuggestedOpener('Ask how they backtest, and what data they use.', opener), false);
  assert.equal(isSuggestedOpener('   ', opener), false);
  assert.equal(isSuggestedOpener(opener, null), false);
});
