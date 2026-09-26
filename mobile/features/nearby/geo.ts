// Map math for the Nearby map. Pure, no React Native imports.
import type { DistanceBand } from '@/features/ble';

export const BANDS: DistanceBand[] = ['very close', 'nearby', 'farther away'];
/** Circle radius per band, in meters (rough: Bluetooth bands, MASTER_SPEC 7.3). */
export const BAND_METERS = [3, 8, 16];
type MapPeer = { user_id: string; band: DistanceBand };
/** Keep the map readable; the screen's list still contains every eligible match. */
export function mapPreview<T extends MapPeer>(peers: T[], selectedId: string | null): T[] {
  return BANDS.flatMap(band => {
    const group = peers.filter(p => p.band === band);
    const preview = group.slice(0, 3);
    const selected = group.find(p => p.user_id === selectedId);
    if (selected && !preview.includes(selected)) preview[preview.length - 1] = selected;
    return preview;
  });
}
/** Equal spacing is decorative, never a measured direction. */
export function bandAngle(peer: MapPeer, peers: MapPeer[]) {
  const ids = peers.filter(p => p.band === peer.band).map(p => p.user_id).sort();
  return -Math.PI / 2 + BANDS.indexOf(peer.band) * 0.55 + ids.indexOf(peer.user_id) * Math.PI * 2 / Math.max(1, ids.length);
}
export const BAND_HINT: Record<DistanceBand, string> = {
  'very close': 'a few steps away',
  nearby: 'across the room',
  'farther away': 'in the area',
};

/** Stable angle per person (radians), so pins don't jump between refreshes. NOT a real direction. */
export function peerAngle(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) / 2 ** 32) * 2 * Math.PI;
}

/** Point `meters` away from `origin` at `angle` (0 = east, counter-clockwise). */
export function offsetMeters(origin: { latitude: number; longitude: number }, angle: number, meters: number) {
  const dLat = (meters * Math.sin(angle)) / 111_320;
  const dLng = (meters * Math.cos(angle)) / (111_320 * Math.cos((origin.latitude * Math.PI) / 180));
  return { latitude: origin.latitude + dLat, longitude: origin.longitude + dLng };
}
