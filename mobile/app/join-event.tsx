import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { setCurrentEventId } from '@/lib/currentEvent';

function parseJoin(raw: string): { payload: string; signature: string } | null {
  const [payload, signature] = raw.trim().split('.');
  if (!payload || !signature) return null;
  return { payload, signature };
}

export default function JoinEventScreen() {
  const c = useColors();
  const [permission, request] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const join = async (raw: string) => {
    const code = parseJoin(raw);
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.joinEvent(code);
      await setCurrentEventId(r.event_id);
      setDone(r.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /register/i.test(msg)
          ? 'Register for this event first (Events tab), then scan again.'
          : /expired/i.test(msg)
            ? 'This QR code has expired. Ask the organizers for the current one.'
            : /invalid/i.test(msg)
              ? 'That isn’t an event check-in QR code.'
              : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: c.text }]}>You’re checked in to {done}</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          Other checked-in attendees can now see you, and you can turn on Event Mode in Nearby.
        </Text>
        <Button label="Go to Nearby" onPress={() => router.replace('/nearby')} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>Check in to an event</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Scan the QR code the organizers show at the entrance. You need to have registered for the event first. This
        checks you in; it doesn’t connect you to anyone.
      </Text>
      {!permission?.granted ? (
        <Button label="Allow camera" onPress={() => void request()} />
      ) : (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => void join(data)}
          />
        </View>
      )}
      {error ? (
        <Card>
          <Text style={{ color: c.danger }}>{error}</Text>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  camera: { flex: 1, minHeight: 280, borderRadius: 16, overflow: 'hidden' },
});
