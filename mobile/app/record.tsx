import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';
import {
  beginAdvertising,
  endAdvertising,
  localName,
  requestAdvertisePermission,
} from '@/features/ble/advertiser';
import {
  RECORDING_LABELS,
  buildRecording,
  shareRecording,
  type RawSighting,
  type Recording,
  type RecordingLabel,
} from '@/features/ble/recording';
import { requestScanPermission, startScan, stopScan } from '@/features/ble/scanner';

// AK6 debug screen: record a labeled Bluetooth session on each phone of a pair, then share the JSON
// with Alan. Keep the screen on and the app open while recording (Event Mode comes later in AK8).
export default function RecordScreen() {
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const [label, setLabel] = useState<RecordingLabel>('talking');
  const [distanceNote, setDistanceNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [last, setLast] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, { rssi: number; n: number }>>({});
  const [elapsed, setElapsed] = useState(0);

  const sightings = useRef<RawSighting[]>([]);
  const startedAt = useRef(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => (appState.current = s));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Stop the radio if the screen unmounts mid-recording.
  useEffect(
    () => () => {
      stopScan();
      endAdvertising();
    },
    [],
  );

  const start = async () => {
    setError(null);
    const [scanOk, advOk] = await Promise.all([requestScanPermission(), requestAdvertisePermission()]);
    if (!scanOk || !advOk) {
      setError('Bluetooth permission was denied. Allow it in Settings and try again.');
      return;
    }
    sightings.current = [];
    setLive({});
    setLast(null);
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      beginAdvertising();
      startScan((peer) => {
        const name = peer.localName;
        if (!name || name === localName || peer.rssi == null) return;
        sightings.current.push({ peer: name, ts: peer.lastSeenAt, rssi: peer.rssi, app_state: appState.current });
        setLive((prev) => ({ ...prev, [name]: { rssi: peer.rssi!, n: (prev[name]?.n ?? 0) + 1 } }));
      });
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stopScan();
      endAdvertising();
    }
  };

  const stop = () => {
    stopScan();
    endAdvertising();
    setRecording(false);
    setLast(
      buildRecording({
        label,
        distanceNote: distanceNote.trim(),
        selfName: localName,
        startedAt: startedAt.current,
        endedAt: Date.now(),
        sightings: sightings.current,
      }),
    );
  };

  const share = async () => {
    if (!last) return;
    try {
      await shareRecording(last);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const peers = Object.entries(live);

  return (
    <>
      <Stack.Screen options={{ title: 'Record session (AK6)' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.muted}>This phone: {localName}</Text>

        <Text style={styles.section}>What is happening?</Text>
        {RECORDING_LABELS.map((l) => (
          <Pressable
            key={l.key}
            disabled={recording}
            onPress={() => setLabel(l.key)}
            style={[styles.option, label === l.key && { borderColor: tint, backgroundColor: `${tint}22` }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: label === l.key, disabled: recording }}>
            <Text style={styles.optionText}>{l.title}</Text>
          </Pressable>
        ))}
        <TextInput
          value={distanceNote}
          onChangeText={setDistanceNote}
          editable={!recording}
          placeholder="Distance / notes, e.g. 1 m, iPhone in pocket"
          placeholderTextColor="#8889"
          style={[styles.input, { color: textColor }]}
        />

        <Pressable
          onPress={recording ? stop : start}
          style={[styles.primary, { backgroundColor: recording ? '#d33' : tint }]}
          accessibilityRole="button">
          <Text style={styles.primaryText}>{recording ? `Stop (${elapsed}s)` : 'Start recording'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {recording ? (
          peers.length === 0 ? (
            <Text style={styles.muted}>Listening… no other phone heard yet.</Text>
          ) : (
            peers.map(([name, p]) => (
              <View key={name} style={styles.row}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.muted}>
                  {p.rssi} dBm · {p.n} readings
                </Text>
              </View>
            ))
          )
        ) : null}

        {last ? (
          <View style={styles.card}>
            <Text style={styles.name}>
              {RECORDING_LABELS.find((l) => l.key === last.label)!.title}: {last.sightings.length} readings from{' '}
              {new Set(last.sightings.map((s) => s.peer)).size} phone(s)
            </Text>
            <Pressable onPress={share} style={[styles.secondary, { borderColor: tint }]} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: tint }]}>Share JSON with Alan</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  section: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  muted: { fontSize: 14, opacity: 0.65 },
  error: { fontSize: 15, color: '#d33' },
  option: { minHeight: 48, borderWidth: 2, borderColor: '#8884', borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  optionText: { fontSize: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#8886', borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  primary: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  secondary: { minHeight: 48, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  row: { borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 12, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#8884', borderRadius: 16, padding: 16, gap: 12 },
});
