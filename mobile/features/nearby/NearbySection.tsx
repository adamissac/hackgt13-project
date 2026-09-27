import { Link, router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { ConnectInPerson } from '@/features/verification/ConnectInPerson';
import { useProximity } from '@/features/ble';
import { BLE_UNAVAILABLE_MESSAGE } from '@/features/ble/native';
import { NearbyMap } from '@/features/nearby/NearbyMap';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useLiveRefresh } from '@/lib/useLiveRefresh';

// Nearby (MASTER_SPEC 3.4), as a section of Home (Home and Nearby were two tabs doing one job).
// Bluetooth decides eligibility; this browse map never reveals a match's actual position.
// Mutual temporary meetup sharing is handled on /meetup/[id]. Home owns the scan switch (its
// "Meet people here" card); this renders the results, and only while scanning so Home stays short.
export function NearbySection({ scan, onScan }: { scan: boolean; onScan: (on: boolean) => void }) {
  const c = useColors();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const destination = useRef<Href | null>(null);
  const finishDismiss = useCallback(() => {
    const next = destination.current;
    destination.current = null;
    if (next) router.push(next);
  }, []);
  const openFromMap = (next: Href) => {
    destination.current = next;
    setExpanded(false);
  };
  useEffect(() => {
    // iOS must finish dismissing its native modal before pushing a new screen.
    if (!expanded && Platform.OS !== 'ios') finishDismiss();
  }, [expanded, finishDismiss]);
  const insets = useSafeAreaInsets();
  const { scanning, peers: heard, radioError, fetchError } = useProximity(scan);
  // Without the Bluetooth radio (Expo Go, radio off, permission denied) nobody can be placed as
  // nearby, so keep the map but show no people rather than replacing the whole screen with an error.
  const peers = radioError ? [] : heard;
  const radioNote = radioError === BLE_UNAVAILABLE_MESSAGE
    ? 'Bluetooth isn’t available in Expo Go, so people nearby can’t be detected here. The map still shows where you are. Just met someone? Verify with a QR code below.'
    : radioError;
  const meetups = useAsync(() => api.meetups(), []);
  useLiveRefresh(meetups.refresh, 3000);
  const selected = peers.find((p) => p.user_id === selectedId) ?? null;
  const meetupByUser = new Map((meetups.state.status === 'ready' ? meetups.state.data.meetups : []).map((m) => [m.other.user_id, m]));
  const selectedMeetup = selected ? meetupByUser.get(selected.user_id) : undefined;
  const mapNote = radioError
    ? 'The blue dot is you. Your location stays on this phone.'
    : `${peers.length} nearby people shown. Pin placement is for browsing only, never someone’s real-world direction.`;

  return (
    <>
      {scan && (
        <>
          <SectionTitle right={<Button label="Expand map ↗" variant="secondary" onPress={() => setExpanded(true)} />}>Around you</SectionTitle>
          {!expanded && <NearbyMap peers={peers} selectedId={selectedId} onSelect={setSelectedId} />}
          <Text style={[styles.small, { color: c.muted }]}>{mapNote}</Text>
          <Text style={[styles.small, { color: c.muted }]}>To appear on each other’s maps, check in to the same event, turn on Open to Meet, and keep Quick Scan open on both phones. Bluetooth needs the development build; GPS and QR work in Expo Go.</Text>
        </>
      )}

      {fetchError && !radioError && /check in/i.test(fetchError) ? (
        <Card>
          <Text style={[styles.h2, { color: c.text }]}>Check in to see who’s here</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            Both people must be checked in to the same event, have Open to Meet on, and keep Quick Scan open in a Bluetooth development build. Existing connections can appear too. Register for the event, then scan the
            organizers’ QR code at the entrance.
          </Text>
          <Button label="Scan event QR code" onPress={() => router.push('/join-event')} />
        </Card>
      ) : fetchError && !radioError ? (
        <ErrorState message={fetchError} onRetry={() => onScan(true)} />
      ) : scan ? (
        <>
          {radioNote ? (
            <Card>
              <Text style={[styles.h2, { color: c.text }]}>Bluetooth is off</Text>
              <Text style={[styles.small, { color: c.muted }]}>{radioNote}</Text>
            </Card>
          ) : null}

          {scanning && !radioError && peers.length === 0 && <Loading label="Looking for people nearby…" />}

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
      ) : null}

    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onDismiss={finishDismiss} onRequestClose={() => setExpanded(false)}>
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
          <Text style={[styles.small, { color: c.muted }]}>To appear on each other’s maps, check in to the same event, turn on Open to Meet, and keep Quick Scan open on both phones. Bluetooth needs the development build; GPS and QR work in Expo Go.</Text>
          {radioNote ? <Text style={[styles.small, { color: c.muted }]}>{radioNote}</Text> : fetchError ? <Text style={[styles.small, { color: c.danger }]}>{fetchError}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {peers.map(p => <Pressable key={p.user_id} onPress={() => setSelectedId(p.user_id)} accessibilityRole="button" accessibilityState={{ selected: selectedId === p.user_id }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: selectedId === p.user_id ? c.tint : c.border, backgroundColor: c.surface }}>
              <Avatar name={p.name} size={32} />
              <Text style={{ color: c.text }}>{p.name}</Text>
            </Pressable>)}
          </ScrollView>
          {selected && <Button label={`View ${(selected.name || 'match').split(' ')[0]}’s profile →`} onPress={() => openFromMap({ pathname: '/match/[id]', params: { id: selected.user_id } })} />}
          {selected && selectedMeetup && <Button label={`Find ${(selected.name || 'match').split(' ')[0]}`} variant="secondary" onPress={() => openFromMap({ pathname: '/meetup/[id]', params: { id: String(selectedMeetup.suggestion_id) } })} />}
        </View>
      </View>
    </Modal>
    </>
  );
}

/** QR verification fallback (AK3, always available) and developer tools, shown at the bottom of Home. */
export function VerifyLinks() {
  const c = useColors();
  return (
    <>
      <ConnectInPerson />
      {__DEV__ ? (
        <Disclosure title="Developer tools">
          <Link href="/ble-debug" style={[styles.devLink, { color: c.muted }]}>BLE hello world</Link>
          <Link href="/record" style={[styles.devLink, { color: c.muted }]}>Record session (AK6)</Link>
        </Disclosure>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
