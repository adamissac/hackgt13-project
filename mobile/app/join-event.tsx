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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: c.text }]}>You’re in {done}</Text>
        <Text style={[styles.body, { color: c.muted }]}>Nearby and matches now use this event.</Text>
        <Button label="See people here" onPress={() => router.replace('/nearby')} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>Scan an event QR</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        This signs you into that company’s event. It does not connect you to a person.
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
