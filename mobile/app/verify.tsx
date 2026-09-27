import { AppIcon } from '@/components/AppIcon';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Vibration } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { startEngine, stopEngine, subscribe } from '@/features/ble/engine';
import { BLE_UNAVAILABLE_MESSAGE, bleAvailable } from '@/features/ble/native';
import { TAP_RSSI_DBM, TapDetector } from '@/features/ble/tap';
import { decodeVerifyCode, encodeVerifyCode, handshakeErrorMessage } from '@/features/qr/code';
import { Button, useColors } from '@/components/ui';
import { ChecklistForm } from '@/features/checklist/ChecklistForm';
import { api, type QrToken, type QrVerifyResponse } from '@/lib/api';
import { getCurrentEventId } from '@/lib/currentEvent';
import { env } from '@/lib/env';

// AK3: verification fallback (MASTER_SPEC 3.5). One person shows a short-lived signed code, the
// other scans it; the server checks signature, expiry, and single-use nonce (POST /qr/verify), creates a
// verified conversation, and both people then get the checklist + silent connect prompt (3.6).
// Always available, so the demo survives if Bluetooth verification doesn't.
const REFRESH_MS = 30_000; // docs/api.md 19: refresh every 30 s (server tokens live 60 s)

type Mode = 'tap' | 'show' | 'scan';
const MODE_LABEL: Record<Mode, string> = { tap: 'Tap phones', show: 'Show code', scan: 'Scan code' };

export default function VerifyScreen() {
  const tint = useThemeColor({}, 'tint');
  // Tap is the quick path when Bluetooth is available; the QR code always works.
  const [mode, setMode] = useState<Mode>(() => (bleAvailable() || env.useMocks ? 'tap' : 'show'));
  const [verified, setVerified] = useState<QrVerifyResponse | null>(null);

  return (
    <>
      <Stack.Screen options={{ title: 'Verify with QR' }} />
      {verified ? (
        <Verified result={verified} onAgain={() => setVerified(null)} />
      ) : (
        <View style={styles.flex}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['tap', 'show', 'scan'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.tab, mode === m && { backgroundColor: tint }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}>
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {MODE_LABEL[m]}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === 'tap' ? (
            <TapPhones onVerified={setVerified} onUseQr={() => setMode('show')} />
          ) : mode === 'show' ? (
            <ShowCode />
          ) : (
            <ScanCode onVerified={setVerified} />
          )}
        </View>
      )}
    </>
  );
}

// "Hold your phones together": both phones advertise their rotating token; once each hears the other at
// touching range for 2 s it claims it, and the server verifies when both claims arrive (api.md 38).
function TapPhones({ onVerified, onUseQr }: { onVerified: (r: QrVerifyResponse) => void; onUseQr: () => void }) {
  const c = useColors();
  const [progress, setProgress] = useState(0);
  const [signal, setSignal] = useState<number | null>(null); // strongest phone heard, dBm (for calibration)
  const [threshold, setThreshold] = useState(TAP_RSSI_DBM);
  // What the phones are doing, and what the SERVER last said (previously hidden, so a rejected claim looked
  // exactly like "waiting for their phone" forever).
  const [phase, setPhase] = useState<'looking' | 'holding' | 'claiming'>('looking');
  const [server, setServer] = useState<'none' | 'waiting' | 'too_far' | 'not_found'>('none');
  const [stuck, setStuck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = bleAvailable();

  useEffect(() => {
    if (!available) return;
    const detector = new TapDetector();
    let claiming = false;
    let done = false;
    let firstClaimAt: number | null = null;
    startEngine({ eventId: getCurrentEventId(), owner: 'tap' });
    const unsub = subscribe(async (snap) => {
      if (snap.error) setError(snap.error);
      const now = Date.now();
      const d = detector.update(snap.heard, now);
      setProgress(d.progress);
      setSignal(d.rssi == null ? null : Math.round(d.rssi));
      setPhase(d.token ? 'claiming' : d.progress > 0 ? 'holding' : 'looking');
      // Offer QR if a tap hasn't completed ~10 s after this phone first claimed.
      if (firstClaimAt !== null && now - firstClaimAt > 10_000) setStuck(true);
      if (!d.token || claiming || done) return;
      claiming = true; // one claim per engine tick (~1 s)
      firstClaimAt ??= now;
      try {
        const r = await api.tapClaim({ token: d.token, rssi: Math.round(d.rssi!), event_id: getCurrentEventId() });
        if (r.status === 'verified' && !done) {
          done = true;
          Vibration.vibrate(120);
          onVerified(r);
        } else {
          setServer('waiting'); // our claim is in; the other phone hasn't claimed us yet
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'too_far') {
          // The live server's floor is stricter than the app's: adopt it so we only claim what it accepts.
          detector.serverTooFar(d.rssi!);
          setThreshold(detector.threshold);
          setServer('too_far');
        } else if (msg === 'not_found') {
          setServer('not_found');
        } else {
          setError(handshakeErrorMessage(msg));
        }
      } finally {
        claiming = false;
      }
    });
    return () => {
      done = true;
      unsub();
      stopEngine('tap');
    };
  }, [available, onVerified]);

  const status =
    phase === 'looking'
      ? 'Looking for the other phone…'
      : phase === 'holding'
        ? 'Keep holding…'
        : server === 'too_far'
          ? 'Hold the backs of the phones flat together: the server needs a stronger signal.'
          : server === 'not_found'
            ? 'Their phone isn’t recognized yet. Both phones need to be signed in (not the demo), online, and on this screen.'
            : server === 'waiting'
              ? 'Your phone is confirmed. Waiting for their phone to confirm you…'
              : 'Checking with the server…';

  if (!available) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>{env.useMocks ? 'Mock mode: no Bluetooth here.' : BLE_UNAVAILABLE_MESSAGE}</Text>
        {env.useMocks ? (
          <Button
            label="Simulate a tap"
            onPress={async () => {
              const r = await api.tapClaim({ token: 'mockmock', rssi: -35 });
              if (r.status === 'verified') onVerified(r);
            }}
          />
        ) : null}
        <Text style={styles.muted}>You can always use Show code / Scan code instead.</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <AppIcon name="phone" size={56} color={c.tint} />
      <Text style={styles.title}>Hold your phones together</Text>
      <Text style={styles.muted}>Both of you open this screen, then touch the backs of your phones.</Text>
      <View style={[styles.meter, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.meterFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: phase === 'claiming' && server === 'waiting' ? c.success : c.tint }]} />
      </View>
      <Text style={styles.body}>{status}</Text>
      <Text style={styles.muted}>
        {signal == null ? 'No phone heard yet' : `Signal ${signal} dBm (touching counts at ${threshold} or stronger)`}
      </Text>
      {stuck ? (
        <>
          <Text style={styles.muted}>Taking too long? A QR code always works.</Text>
          <Button label="Use QR instead" variant="secondary" onPress={onUseQr} />
        </>
      ) : null}
      {error ? <Text style={[styles.body, styles.error]}>{error}</Text> : null}
    </View>
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
        onVerified(await api.qrVerify({ ...code, event_id: getCurrentEventId() }));
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

function Verified({ result, onAgain }: { result: QrVerifyResponse; onAgain: () => void }) {
  return (
    <ChecklistForm
      conversationId={result.conversation_id}
      name={result.other.name}
      checklist={result.checklist}
      onAgain={onAgain}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tapIcon: { fontSize: 56 },
  meter: { alignSelf: 'stretch', height: 14, borderRadius: 7, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 7 },
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
});
