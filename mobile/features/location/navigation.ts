import type { LatLng } from './geo';

/** External navigation is used only after the meetup flow confirms reciprocal sharing. */
export function meetupMapsUrl(point: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lng}`)}&travelmode=walking`;
}
