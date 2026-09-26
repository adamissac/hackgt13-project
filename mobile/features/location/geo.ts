// Pure geometry for the "find them" view (AK7). No React Native imports, so
// `node --experimental-strip-types --test features/location/geo.test.mjs` can test it.

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000; // earth radius, m
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b, degrees clockwise from true north, 0-360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Arrow rotation on screen: bearing to them relative to where the phone points. */
export function arrowDeg(bearing: number, heading: number | null): number {
  return (((bearing - (heading ?? 0)) % 360) + 360) % 360;
}

/** Rough band copy only: never exact meters (product rule), GPS is ±10-20 m indoors anyway. */
export function distanceBand(m: number): { label: string; close: boolean } {
  if (m < 20) return { label: 'Very close. Look around!', close: true };
  if (m < 60) return { label: 'About a minute away', close: false };
  if (m < 150) return { label: 'A couple of minutes away', close: false };
  if (m < 400) return { label: 'About 5 minutes away', close: false };
  return { label: 'More than 5 minutes away', close: false };
}

/** Compass word for when the device has no heading (e.g. simulator). */
export function compassWord(bearing: number): string {
  const words = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return words[Math.round(bearing / 45) % 8];
}
