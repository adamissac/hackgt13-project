import assert from 'node:assert/strict';
import { test } from 'node:test';
import { otherPeopleFeed } from './visibility.ts';

test('feed removes own posts, GitHub activity and summaries without hiding other people', () => {
  const items = [
    { type: 'item', kind: 'post', author: { user_id: 'self' } },
    { type: 'item', kind: 'github', author: { user_id: 'self' } },
    { type: 'summary', author: { user_id: 'self' } },
    { type: 'item', author: { user_id: 'me' } },
    { type: 'item', author: { user_id: 'friend' } },
    { type: 'summary', author: { user_id: 'friend' } },
  ];
  assert.deepEqual(otherPeopleFeed(items, 'self'), items.slice(4));
  assert.deepEqual(otherPeopleFeed(items), []);
});
