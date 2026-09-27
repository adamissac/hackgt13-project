import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
  const [code, setCode] = useState('');

  // Checked in: go straight into that event's session (its page), which focuses on the people who also scanned in.
  const finish = async (eventId: number, name: string) => {
    await setCurrentEventId(eventId);
    setDone(name);
    router.replace({ pathname: '/attend/[id]', params: { id: String(eventId) } });
  };
  const friendly = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return /register/i.test(msg)
      ? 'Register for this event first (Events tab), then scan again.'
      : /expired/i.test(msg)
        ? 'This QR code has expired. Ask the organizers for the current one.'
        : /invalid/i.test(msg)
          ? 'That isn’t an event check-in QR code.'
          : msg;
  };

  const joinQr = async (raw: string) => {
    const token = parseJoin(raw);
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.joinEvent(token);
      await finish(r.event_id, r.name);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const joinCode = async () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.enterEventCode(code.trim());
      await finish(r.event_id, r.name);
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
          Other checked-in attendees can now see you. You are not connected to anyone yet.
        </Text>
        <Button label="Go to Nearby" onPress={() => router.replace('/nearby')} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>Join a company event</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Enter the join code the company sent (registers you and checks you in), or scan their QR after you register.
        Neither one connects you to a person.
      </Text>
      <Card>
        <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Join code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="ABC-123"
          placeholderTextColor={c.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { color: c.text, borderColor: c.border }]}
        />
        <Button label="Enter code" onPress={() => void joinCode()} loading={busy} disabled={code.trim().length < 4} />
      </Card>
      <Text style={[styles.body, { color: c.muted }]}>Or scan the QR</Text>
      {!permission?.granted ? (
        <Button label="Allow camera" onPress={() => void request()} />
      ) : (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => void joinQr(data)}
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
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 20, letterSpacing: 2, marginVertical: 8 },
  camera: { flex: 1, minHeight: 220, borderRadius: 16, overflow: 'hidden' },
});
