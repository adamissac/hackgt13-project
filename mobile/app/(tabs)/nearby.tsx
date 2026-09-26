import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { useProximity } from '@/features/ble';
import { EventModeCard } from '@/features/ble/EventModeCard';
import { BAND_HINT, BANDS, mapPreview } from '@/features/nearby/geo';
import { NearbyMap } from '@/features/nearby/NearbyMap';

// Nearby (MASTER_SPEC 3.4). Map layout by Arjun; scanning, bands, Event Mode and QR are Akshar's
// (features/ble). Distances are bands only, never meters, and direction is never shown.
export default function NearbyScreen() {
  const c = useColors();
  const [scan, setScan] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [band, setBand] = useState<string>('All');
  const insets = useSafeAreaInsets();
  const { scanning, peers, error } = useProximity(scan);
  const selected = peers.find((p) => p.user_id === selectedId) ?? null;
  const filtered = peers.filter(p => band === 'All' || p.band === band);
  const preview = mapPreview(filtered, selectedId);
  const filters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {['All', ...BANDS].map(value => <Pressable key={value} onPress={() => { setBand(value); setSelectedId(null); }} accessibilityRole="button" accessibilityState={{ selected: value === band }}
        style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 22, backgroundColor: value === band ? c.tint : c.surfaceAlt }}>
        <Text style={{ color: value === band ? c.onTint : c.text, fontWeight: '600' }}>{value}</Text>
      </Pressable>)}
    </ScrollView>
  );
  const mapNote = `${preview.length} of ${filtered.length} matches on the map. ${preview.length < filtered.length ? 'Select anyone from the list to show them. ' : ''}Approximate distance, not actual direction.`;

  return (
    <>
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
          <Switch value={scan} onValueChange={setScan} trackColor={{ true: c.tint, false: c.surfaceAlt }} accessibilityLabel="Scan for people nearby" />
        </View>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={() => setScan(true)} />
      ) : scan ? (
        <>
          <SectionTitle right={<Button label="Expand map ↗" variant="secondary" onPress={() => setExpanded(true)} />}>Around you</SectionTitle>
          {filters}
          {!expanded && <NearbyMap peers={preview} selectedId={selectedId} onSelect={setSelectedId} />}
          <Text style={[styles.small, { color: c.muted }]}>
            {mapNote}
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
              const inBand = filtered.filter((p) => p.band === band);
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
                            {p.highlight ? <Text style={{ color: c.muted }}>  · top match</Text> : null}
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
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ paddingHorizontal: 20, paddingVertical: 10, gap: 8 }}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: c.text }]}>Around you</Text>
              <Text style={[styles.small, { color: c.muted }]}>Your matches, with room to explore.</Text>
            </View>
            <Button label="Done" variant="secondary" onPress={() => setExpanded(false)} />
          </View>
          {filters}
        </View>
        {expanded && <NearbyMap peers={preview} selectedId={selectedId} onSelect={setSelectedId} expanded />}
        <View style={{ padding: 16, gap: 10 }}>
          <Text style={[styles.small, { color: c.muted }]}>{mapNote}</Text>
          {error && <Text style={[styles.small, { color: c.danger }]}>{error}</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filtered.map(p => <Pressable key={p.user_id} onPress={() => setSelectedId(p.user_id)} accessibilityRole="button" accessibilityState={{ selected: selectedId === p.user_id }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: selectedId === p.user_id ? c.tint : c.border, backgroundColor: c.surface }}>
              <Avatar name={p.name} size={32} />
              <Text style={{ color: c.text }}>{p.name}</Text>
            </Pressable>)}
          </ScrollView>
          {selected && <Button label={`View ${(selected.name || 'match').split(' ')[0]}’s profile →`} onPress={() => { setExpanded(false); router.push(`/match/${selected.user_id}`); }} />}
        </View>
      </View>
    </Modal>
    </>
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
