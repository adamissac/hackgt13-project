import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { useProximity } from '@/features/ble';
import { EventModeCard } from '@/features/ble/EventModeCard';
import { BAND_HINT, BANDS } from '@/features/nearby/geo';
import { NearbyMap } from '@/features/nearby/NearbyMap';

// Nearby (MASTER_SPEC 3.4). Map layout by Arjun; scanning, bands, Event Mode and QR are Akshar's
// (features/ble). Distances are bands only, never meters, and direction is never shown.
export default function NearbyScreen() {
  const c = useColors();
  const [scan, setScan] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { scanning, peers, error } = useProximity(scan);
  const selected = peers.find((p) => p.user_id === selectedId) ?? null;

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Button label="Meeting activity & Open to Meet" variant="secondary" onPress={() => router.push('/discover')} />
      <Card>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: c.text }]}>Find your matches nearby</Text>
            <Text style={[styles.small, { color: c.muted }]}>
              {scan ? 'Scanning with Bluetooth. Only your matches show up.' : 'Turn on to see which of your matches are close by.'}
            </Text>
          </View>
          <Switch value={scan} onValueChange={setScan} accessibilityLabel="Scan for people nearby" />
        </View>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={() => setScan(true)} />
      ) : scan ? (
        <>
          <NearbyMap peers={peers} selectedId={selectedId} onSelect={setSelectedId} />
          <Text style={[styles.small, { color: c.muted }]}>
            Distance is approximate. Pins don’t show actual direction.
          </Text>

          {scanning && peers.length === 0 && <Loading label="Looking for your matches nearby…" />}

          {selected && (
            <Card highlight>
              <View style={styles.personHead}>
                <Avatar name={selected.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.h2, { color: c.text }]}>{selected.name}</Text>
                  <Text style={[styles.small, { color: c.muted }]}>
                    {selected.band}: {BAND_HINT[selected.band]}
                    {selected.highlight ? ' · top match' : ''}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedId(null)} hitSlop={12} accessibilityLabel="Close">
                  <Text style={[styles.close, { color: c.muted }]}>✕</Text>
                </Pressable>
              </View>
              {selected.why && selected.why.length > 0 && (
                <View style={styles.chips}>
                  {selected.why.slice(0, 3).map((w) => (
                    <Chip key={w} label={w} tone="tint" />
                  ))}
                </View>
              )}
              <Button label="See profile + icebreakers" onPress={() => router.push(`/match/${selected.user_id}`)} />
            </Card>
          )}

          {peers.length > 0 &&
            BANDS.map((band) => {
              const inBand = peers.filter((p) => p.band === band);
              if (!inBand.length) return null;
              return (
                <View key={band} style={{ gap: 8 }}>
                  <SectionTitle>{`${band} · ${BAND_HINT[band]}`}</SectionTitle>
                  <Card style={{ paddingVertical: 4 }}>
                    {inBand.map((p, i) => (
                      <Pressable
                        key={p.user_id}
                        onPress={() => setSelectedId(p.user_id)}
                        accessibilityRole="button"
                        style={[styles.row, i < inBand.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                        <Avatar name={p.name} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, { color: c.text }]}>
                            {p.name}
                            {p.highlight ? <Text style={{ color: c.success }}>  ● top</Text> : null}
                          </Text>
                          {p.why?.length ? (
                            <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>{p.why.slice(0, 2).join(' · ')}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              );
            })}
        </>
      ) : (
        <View style={styles.emptyNearby}>
          <Text style={[styles.h1, { color: c.text }]}>A hello could be close by.</Text>
          <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>Start scanning to find your matches in the room.</Text>
        </View>
      )}

      {/* AK8 (Akshar): Event Mode keeps scanning going at the event. */}
      <Disclosure title="Event mode" subtitle="Keep scanning while you’re at the event">
        <EventModeCard />
      </Disclosure>
      {/* AK3 (Akshar): QR verification fallback, always available. */}
      <Link href="/verify" style={[styles.link, { color: c.tint }]}>
        Just talked with someone? Verify with QR
      </Link>
      {__DEV__ ? (
        <Disclosure title="Developer tools">
          <Link href="/ble-debug" style={[styles.devLink, { color: c.muted }]}>BLE hello world</Link>
          <Link href="/record" style={[styles.devLink, { color: c.muted }]}>Record session (AK6)</Link>
        </Disclosure>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, paddingBottom: 110, width: '100%', maxWidth: 640, alignSelf: 'center' },
  emptyNearby: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { fontSize: 18, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { fontSize: 20, fontWeight: '600', padding: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  rowName: { fontSize: 16, fontWeight: '700' },
  link: { fontSize: 16, fontWeight: '700', paddingVertical: 8 },
  devLinks: { flexDirection: 'row', gap: 16 },
  devLink: { fontSize: 14, paddingVertical: 8 },
});
