// Nearby map (Arjun, on top of Akshar's AK5 proximity data). A real street map around YOU, with three
// circles for the Bluetooth distance bands. Bluetooth gives distance, not direction, so each person is
// pinned somewhere in their band at a stable angle derived from their id: the ring is meaningful, the
// direction is not (said on screen). Your coordinates stay on the phone: nothing here is uploaded.
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { useColors } from '@/components/ui';
import type { Peer } from '@/features/ble';

import { offsetMeters, peerAngle } from './geo';

const FALLBACK = { latitude: 33.7756, longitude: -84.3963 }; // Georgia Tech, if location is off

export function NearbyMap({ peers, selectedId, onSelect, expanded = false }: { peers: Peer[]; selectedId: string | null; onSelect: (id: string | null) => void; expanded?: boolean }) {
  const c = useColors();
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const map = useRef<MapView>(null);

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
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 5 }, (p) =>
        !cancelled && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })().catch(() => { if (!cancelled) setDenied(true); });
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  const center = me ?? FALLBACK;
  const region: Region = { ...center, latitudeDelta: 0.00036, longitudeDelta: 0.00044 };

  useEffect(() => {
    if (me) map.current?.animateToRegion({ ...me, latitudeDelta: 0.00036, longitudeDelta: 0.00044 }, 400);
  }, [me]);

  return (
    <View style={[styles.wrap, { borderColor: c.border }, expanded && { flex: 1, height: undefined, borderRadius: 0 }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation={Boolean(me)}
        showsMyLocationButton
        showsPointsOfInterests={false}
        showsBuildings={false}
        onPress={() => onSelect(null)}>
        {peers.map((p) => {
          // This gives each eligible nearby match a tap target without implying
          // their direction or position. Exact coordinates never enter Nearby.
          const pos = offsetMeters(center, peerAngle(p.user_id), 18 + (peers.indexOf(p) % 4) * 7);
          const sel = p.user_id === selectedId;
          return (
            <Marker key={`${p.user_id}-${sel}`} coordinate={pos} onPress={(e) => { e.stopPropagation(); onSelect(p.user_id); }} tracksViewChanges={false} zIndex={sel ? 10 : 1}>
              <View style={styles.pinWrap}>
                <View style={[styles.pin, { backgroundColor: c.tint, borderColor: c.surface }]}>
                  <Text style={styles.pinText}>{initials(p.name)}</Text>
                </View>
                {sel && <View style={[styles.pinLabel, { backgroundColor: c.surface }]}>
                  <Text style={[styles.pinName, { color: c.text }]} numberOfLines={1}>{(p.name || 'Someone').split(' ')[0]}</Text>
                </View>}
              </View>
            </Marker>
          );
        })}
      </MapView>
      {denied && (
        <View style={[styles.banner, { backgroundColor: c.surface }]}>
          <Text style={[styles.bannerText, { color: c.muted }]}>Location is off, so the map is centered on campus. People and distances still work.</Text>
        </View>
      )}
    </View>
  );
}

function initials(name: string | null | undefined) {
  return (name || '?').split(/\s+/).map((w) => w[0] ?? '').join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

const styles = StyleSheet.create({
  wrap: { height: 380, borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  pinWrap: { alignItems: 'center' },
  pin: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  pinText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pinLabel: { marginTop: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 90 },
  pinName: { fontSize: 12, fontWeight: '700' },
  banner: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 10, padding: 10 },
  bannerText: { fontSize: 13, lineHeight: 18 },
});
