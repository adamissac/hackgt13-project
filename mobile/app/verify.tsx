import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { decodeVerifyCode, encodeVerifyCode, handshakeErrorMessage } from '@/features/qr/code';
import { Avatar, Button, Card, useColors } from '@/components/ui';
import { api, type ConversationFeedbackResponse, type QrToken, type QrVerifyResponse } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';

// AK3: verification fallback (MASTER_SPEC 3.5). One person shows a short-lived signed code, the
// other scans it; the server checks signature, expiry, and single-use nonce (POST /qr/verify), creates a
// verified conversation, and both people then get the checklist + silent connect prompt (3.6).
// Always available, so the demo survives if Bluetooth verification doesn't.
const REFRESH_MS = 30_000; // docs/api.md 19: refresh every 30 s (server tokens live 60 s)

type Mode = 'show' | 'scan';

export default function VerifyScreen() {
  const tint = useThemeColor({}, 'tint');
  const [mode, setMode] = useState<Mode>('show');
  const [verified, setVerified] = useState<QrVerifyResponse | null>(null);

  return (
    <>
      <Stack.Screen options={{ title: 'Verify with QR' }} />
      {verified ? (
        <Verified result={verified} onAgain={() => setVerified(null)} />
      ) : (
        <View style={styles.flex}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['show', 'scan'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.tab, mode === m && { backgroundColor: tint }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}>
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {m === 'show' ? 'Show my code' : 'Scan their code'}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === 'show' ? <ShowCode /> : <ScanCode onVerified={setVerified} />}
        </View>
      )}
    </>
  );
}

function ShowCode() {
  const [token, setToken] = useState<QrToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setToken(await api.verifyToken());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  if (error && !token) return <ErrorState message={error} onRetry={load} />;
  if (!token) return <Loading label="Getting your code…" />;
  return (
    <View style={styles.center}>
      <View style={styles.qr}>
        <QRCode value={encodeVerifyCode(token)} size={260} />
      </View>
      <Text style={styles.body}>Let the person you talked with scan this.</Text>
      <Text style={styles.muted}>The code refreshes every 30 seconds and works once.</Text>
    </View>
  );
}

function ScanCode({ onVerified }: { onVerified: (r: QrVerifyResponse) => void }) {
  const tint = useThemeColor({}, 'tint');
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'checking' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  });
  const busy = useRef(false);

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (busy.current) return;
      const code = decodeVerifyCode(data);
      if (!code) {
        setStatus({ kind: 'error', message: "That isn't a Formal Connection verification code." });
        return;
      }
      busy.current = true;
      setStatus({ kind: 'checking' });
      try {
        onVerified(await api.qrVerify({ ...code, event_id: HACKGT_EVENT_ID }));
      } catch (e) {
        setStatus({ kind: 'error', message: handshakeErrorMessage(e instanceof Error ? e.message : String(e)) });
        busy.current = false;
      }
    },
    [onVerified],
  );

  if (!permission) return <Loading label="Checking camera access…" />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Camera access is needed to scan their code.</Text>
        <Pressable
          onPress={requestPermission}
          style={[styles.primary, { backgroundColor: tint }]}
          accessibilityRole="button">
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        style={styles.flex}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={status.kind === 'checking' ? undefined : onScanned}
      />
      <View style={styles.scanFooter}>
        {status.kind === 'checking' ? (
          <Text style={styles.body}>Verifying…</Text>
        ) : status.kind === 'error' ? (
          <Text style={[styles.body, styles.error]}>{status.message}</Text>
        ) : (
          <Text style={styles.body}>Point the camera at their code.</Text>
        )}
      </View>
    </View>
  );
}

// Post-conversation flow (3.6): what did you talk about, then a silent "connect?".
// AD8 (Adam) may replace this with a shared checklist screen; the API calls stay the same.
function Verified({ result, onAgain }: { result: QrVerifyResponse; onAgain: () => void }) {
  const c = useColors();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ConversationFeedbackResponse | null>(null);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async (wantsConnect: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setOutcome(
        await api.conversationFeedback(result.conversation_id, {
          talked_about: [...picked],
          other_topic: other.trim(),
          wants_connect: wantsConnect,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const name = result.other.name;
  if (outcome) {
    return (
      <View style={styles.center}>
        <Avatar name={name} size={72} />
        {outcome.status === 'connected' ? (
          <Text style={styles.title}>You&apos;re connected with {outcome.connection.name}</Text>
        ) : outcome.status === 'waiting' ? (
          // Same screen whether they said no, haven't answered, or never will (MASTER_SPEC 1.3).
          <>
            <Text style={styles.title}>Thanks! We&apos;ll let you know</Text>
            <Text style={styles.muted}>If {name} also wants to connect, you&apos;ll both be notified.</Text>
          </>
        ) : (
          <Text style={styles.title}>Got it. Nothing was sent to {name}.</Text>
        )}
        <Button label="Verify someone else" variant="secondary" onPress={onAgain} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.verified}>
      <View style={styles.header}>
        <Avatar name={name} size={56} />
        <View style={styles.flex}>
          <Text style={styles.title}>You talked with {name}</Text>
          <Text style={styles.muted}>Verified in person</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.body}>What did you talk about?</Text>
        {result.checklist.map((t) => {
          const on = picked.has(t.interest_id);
          return (
            <Pressable
              key={t.interest_id}
              onPress={() => toggle(t.interest_id)}
              style={[styles.check, { borderColor: on ? c.tint : c.border, backgroundColor: on ? c.tintSoft : 'transparent' }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}>
              <Text style={[styles.checkText, on && { color: c.tint, fontWeight: '700' }]}>
                {on ? '✓ ' : ''}
                {t.name}
              </Text>
            </Pressable>
          );
        })}
        <TextInput
          value={other}
          onChangeText={setOther}
          placeholder="Something else? (optional)"
          placeholderTextColor={c.muted}
          maxLength={120}
          style={[styles.input, { color: c.text, borderColor: c.border }]}
        />
      </Card>

      <Text style={styles.question}>Do you want to connect with {name}?</Text>
      <Text style={styles.muted}>They only find out if you both say yes.</Text>
      {error ? <Text style={[styles.body, styles.error]}>{error}</Text> : null}
      <Button label="Yes, connect" onPress={() => send(true)} loading={busy} />
      <Button label="No thanks" variant="ghost" onPress={() => send(false)} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#8886', alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  qr: { padding: 16, backgroundColor: '#fff', borderRadius: 16 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 17, textAlign: 'center' },
  muted: { fontSize: 14, opacity: 0.65, textAlign: 'center' },
  error: { color: '#d33' },
  scanFooter: { padding: 20, minHeight: 80, justifyContent: 'center' },
  primary: { minHeight: 52, paddingHorizontal: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  verified: { padding: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  question: { fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  check: { minHeight: 48, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', marginTop: 8 },
  checkText: { fontSize: 16 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, marginTop: 8 },
});
