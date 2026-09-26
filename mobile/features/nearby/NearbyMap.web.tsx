// Web preview fallback: react-native-maps is native-only, so the browser shows Akshar's radar instead.
import type { Peer } from '@/features/ble';
import { Radar } from '@/features/ble/Radar';

export function NearbyMap({ peers, onSelect }: { peers: Peer[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  return <Radar peers={peers} onSelect={(p) => onSelect(p.user_id)} />;
}
