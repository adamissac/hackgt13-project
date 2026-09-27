import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetupMapsUrl } from './navigation.ts';

test('navigation URL contains only a mutually shared meetup destination', () => {
  assert.equal(typeof meetupMapsUrl, 'function');
  assert.equal(meetupMapsUrl({ lat: 33.7756, lng: -84.3963 }), 'https://www.google.com/maps/dir/?api=1&destination=33.7756%2C-84.3963&travelmode=walking');
});
