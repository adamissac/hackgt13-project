import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { decodeVerifyCode, encodeVerifyCode, handshakeErrorMessage } from '@/features/qr/code';
import { api, type HandshakeResponse, type QrToken } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';

// AK3: verification fallback (MASTER_SPEC 3.5). One person shows a short-lived signed code, the
// other scans it; the server checks signature, expiry, and single-use nonce (POST /handshake).
// Always available, so the demo survives if Bluetooth verification doesn't.
const REFRESH_MS = 30_000; // docs/api.md 8: refresh every 30 s (server tokens live 60 s)

type Mode = 'show' | 'scan';

export default function VerifyScreen() {
  const tint = useThemeColor({}, 'tint');
  const [mode, setMode] = useState<Mode>('show');
  const [verified, setVerified] = useState<HandshakeResponse | null>(null);

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
      setToken(await api.qrToken());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
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

function ScanCode({ onVerified }: { onVerified: (r: HandshakeResponse) => void }) {
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
        onVerified(await api.handshake({ ...code, event_id: HACKGT_EVENT_ID }));
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

function Verified({ result, onAgain }: { result: HandshakeResponse; onAgain: () => void }) {
  const tint = useThemeColor({}, 'tint');
  return (
    <ScrollView contentContainerStyle={styles.verified}>
      <Text style={styles.title}>Verified: you talked with {result.other.name}</Text>
      {/* AD8 (Adam) owns the checklist + connect prompt. Hook it up here with result.handshake_id. */}
      <Text style={styles.body}>Next you&apos;ll pick what you talked about:</Text>
      {result.checklist.map((c) => (
        <View key={c.interest_id} style={styles.chip}>
          <Text style={styles.body}>{c.name}</Text>
        </View>
      ))}
      <Pressable onPress={onAgain} style={[styles.secondary, { borderColor: tint }]} accessibilityRole="button">
        <Text style={[styles.secondaryText, { color: tint }]}>Verify someone else</Text>
      </Pressable>
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
  secondary: { minHeight: 48, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  verified: { padding: 24, gap: 12 },
  chip: { borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 12 },
});
