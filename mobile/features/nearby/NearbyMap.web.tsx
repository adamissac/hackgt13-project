// Web has no Apple/Google MapView. This is a street map of where you are.
// Other people stay as list rows: pins here would look like their real position.
import * as Location from 'expo-location';
import { createElement, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/components/ui';
import type { Peer } from '@/features/ble';

const FALLBACK = { latitude: 33.7756, longitude: -84.3963 };

export function NearbyMap({ peers, selectedId, onSelect, expanded = false }: {
  peers: Peer[]; selectedId: string | null; onSelect: (id: string | null) => void; expanded?: boolean;
}) {
  const c = useColors();
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [denied, setDenied] = useState(false);
  void peers;
  void selectedId;
  void onSelect;

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cancelled) return;
      setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 8 }, (p) =>
        !cancelled && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })().catch(() => { if (!cancelled) setDenied(true); });
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  const center = me ?? FALLBACK;
  const pad = 0.0032;
  const bbox = [center.longitude - pad, center.latitude - pad, center.longitude + pad, center.latitude + pad].join('%2C');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.latitude}%2C${center.longitude}`;

  return (
    <View style={[styles.wrap, { borderColor: c.border }, expanded && styles.expanded]}>
      {createElement('iframe', {
        title: 'Map around you',
        src,
        style: { border: 0, width: '100%', height: '100%', minHeight: expanded ? 480 : 380 },
      })}
      {denied && (
        <View style={[styles.banner, { backgroundColor: c.surface }]}>
          <Text style={[styles.bannerText, { color: c.muted }]}>Location is off, so the map is centered on campus.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 380, borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  expanded: { flex: 1, height: undefined, borderRadius: 0, minHeight: 480 },
  banner: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 10, padding: 10 },
  bannerText: { fontSize: 13, lineHeight: 18 },
});
