import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import Svg, { Circle } from 'react-native-svg';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { useProximity } from '@/features/ble';
import { BLE_UNAVAILABLE_MESSAGE } from '@/features/ble/native';
import { NearbyMap } from '@/features/nearby/NearbyMap';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// Nearby (MASTER_SPEC 3.4). Bluetooth decides eligibility; this browse map never reveals
// a match's actual position. Mutual temporary meetup sharing is handled on /meetup/[id].
export default function NearbyScreen() {
  const c = useColors();
  const [scan, setScan] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const { scanning, peers: heard, radioError, fetchError } = useProximity(scan);
  // Without the Bluetooth radio (Expo Go, radio off, permission denied) nobody can be placed as
  // nearby, so keep the map but show no people rather than replacing the whole screen with an error.
  const peers = radioError ? [] : heard;
  const radioNote = radioError === BLE_UNAVAILABLE_MESSAGE
    ? 'Bluetooth isn’t available in Expo Go, so people nearby can’t be detected here. The map still shows where you are. Just met someone? Verify with a QR code below.'
    : radioError;
  const meetups = useAsync(() => api.meetups(), []);
  const selected = peers.find((p) => p.user_id === selectedId) ?? null;
  const meetupByUser = new Map((meetups.state.status === 'ready' ? meetups.state.data.meetups : []).map((m) => [m.other.user_id, m]));
  const selectedMeetup = selected ? meetupByUser.get(selected.user_id) : undefined;
  const mapNote = radioError
    ? 'The blue dot is you. Your location stays on this phone.'
    : `${peers.length} nearby matches shown. Pin placement is for browsing only, never someone’s real-world direction.`;

  return (
    <>
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <View style={styles.scanRow}>
        <Pressable onPress={() => setScan(!scan)} accessibilityRole="switch" accessibilityState={{ checked: scan }} accessibilityLabel="Scan for people nearby" style={styles.scanWrap}>
          <Svg width={132} height={132} style={StyleSheet.absoluteFill} pointerEvents="none">
            {[64, 52].map((r, i) => (
              <Circle key={r} cx={66} cy={66} r={r} stroke={c.tint} strokeOpacity={scan ? 0.35 - i * 0.12 : 0.14} strokeWidth={1.5} fill="none" />
            ))}
          </Svg>
          <View style={[styles.scanButton, { backgroundColor: scan ? c.tint : c.surface, borderColor: c.tint }]}>
            <Text style={{ color: scan ? '#FFFFFF' : c.tint, fontSize: 15, fontWeight: '800' }}>{scan ? 'ON' : 'SCAN'}</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.radarTitle, { color: c.text }]}>Find your matches <Text style={{ color: c.tint }}>nearby</Text></Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {scan ? 'Scanning with Bluetooth. Only your matches show up. Tap to stop.' : 'Tap scan to see which of your matches are close by.'}
          </Text>
        </View>
      </View>
      <Button label="Meeting activity & Open to Meet" variant="secondary" onPress={() => router.push('/discover')} />

      <SectionTitle right={scan ? <Button label="Expand map ↗" variant="secondary" onPress={() => setExpanded(true)} /> : undefined}>Around you</SectionTitle>
      {!expanded && <NearbyMap peers={scan ? peers : []} selectedId={selectedId} onSelect={setSelectedId} />}
      <Text style={[styles.small, { color: c.muted }]}>{mapNote}</Text>

      {fetchError && !radioError && /check in/i.test(fetchError) ? (
        <Card>
          <Text style={[styles.h2, { color: c.text }]}>Check in to see who’s here</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            Only attendees who scanned the event’s QR code show up to each other. Register for the event, then scan the
            organizers’ QR code at the entrance.
          </Text>
          <Button label="Scan event QR code" onPress={() => router.push('/join-event')} />
        </Card>
      ) : fetchError && !radioError ? (
        <ErrorState message={fetchError} onRetry={() => setScan(true)} />
      ) : scan ? (
        <>
          {radioNote ? (
            <Card>
              <Text style={[styles.h2, { color: c.text }]}>Bluetooth is off</Text>
              <Text style={[styles.small, { color: c.muted }]}>{radioNote}</Text>
            </Card>
          ) : null}

          {scanning && !radioError && peers.length === 0 && <Loading label="Looking for your matches nearby…" />}

          {selected && (
            <Card highlight>
              <View style={styles.personHead}>
                <Avatar name={selected.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.h2, { color: c.text }]}>{selected.name}</Text>
                  <Text style={[styles.small, { color: c.muted }]}>
                    Nearby match{selected.highlight ? ' · top match' : ''}
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
              {selectedMeetup && <Button label={`Find ${(selected.name || 'match').split(' ')[0]}`} variant="secondary" onPress={() => router.push({ pathname: '/meetup/[id]', params: { id: String(selectedMeetup.suggestion_id) } })} />}
            </Card>
          )}

          {peers.length > 0 && (
                <View style={{ gap: 8 }}>
                  <SectionTitle>Everyone nearby</SectionTitle>
                  <Card style={{ paddingVertical: 4 }}>
                    {peers.map((p, i) => (
                      <Pressable
                        key={p.user_id}
                        onPress={() => setSelectedId(p.user_id)}
                        accessibilityRole="button"
                        style={[styles.row, i < peers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
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
          )}
        </>
      ) : (
        <View style={styles.emptyNearby}>
          <Text style={[styles.h1, { color: c.text }]}>A hello could be close by.</Text>
          <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>Start scanning to find your matches in the room.</Text>
        </View>
      )}

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
          <Text style={[styles.small, { color: c.muted }]}>All nearby matches</Text>
        </View>
        {expanded && <NearbyMap peers={peers} selectedId={selectedId} onSelect={setSelectedId} expanded />}
        <View style={{ padding: 16, gap: 10 }}>
          <Text style={[styles.small, { color: c.muted }]}>{mapNote}</Text>
          {radioNote ? <Text style={[styles.small, { color: c.muted }]}>{radioNote}</Text> : fetchError ? <Text style={[styles.small, { color: c.danger }]}>{fetchError}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {peers.map(p => <Pressable key={p.user_id} onPress={() => setSelectedId(p.user_id)} accessibilityRole="button" accessibilityState={{ selected: selectedId === p.user_id }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: selectedId === p.user_id ? c.tint : c.border, backgroundColor: c.surface }}>
              <Avatar name={p.name} size={32} />
              <Text style={{ color: c.text }}>{p.name}</Text>
            </Pressable>)}
          </ScrollView>
          {selected && <Button label={`View ${(selected.name || 'match').split(' ')[0]}’s profile →`} onPress={() => { setExpanded(false); router.push(`/match/${selected.user_id}`); }} />}
          {selected && selectedMeetup && <Button label={`Find ${(selected.name || 'match').split(' ')[0]}`} variant="secondary" onPress={() => { setExpanded(false); router.push({ pathname: '/meetup/[id]', params: { id: String(selectedMeetup.suggestion_id) } }); }} />}
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, paddingBottom: 110, width: '100%', maxWidth: 640, alignSelf: 'center' },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scanWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  scanButton: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radarTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6 },
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
