import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, useColors } from '@/components/ui';
import { api, type GpsFix, type QrVerifyResponse } from '@/lib/api';
import { getCurrentEventId } from '@/lib/currentEvent';
import { env } from '@/lib/env';

async function locate(): Promise<GpsFix> {
  if (!(await Location.requestForegroundPermissionsAsync()).granted) {
    throw new Error('Allow location to verify proximity, or use the QR option above.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('GPS timed out. Try outdoors or use QR verification.')), 20000); }),
    ]);
    if (fix.mocked || fix.coords.accuracy == null || fix.coords.accuracy > 25 || Date.now() - fix.timestamp > 60000) {
      throw new Error('GPS is not accurate enough. Try near a window or outdoors, or use QR verification.');
    }
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy,
      timestamp: fix.timestamp / 1000, mocked: fix.mocked ?? false };
  } finally { clearTimeout(timer); }
}

export function GpsConnect({ onVerified }: { onVerified: (result: QrVerifyResponse) => void }) {
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState<{ code: string; expires_at: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => { setToken(null); setError('Your code expired. Create a fresh GPS code.'); }, Math.max(0, Date.parse(token.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [token]);
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await work(); } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Could not verify proximity.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
    <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>Connect with someone here</Text>
    <Text style={{ color: c.muted, lineHeight: 22 }}>After you talk, one person shows a GPS code and the other scans it. Both phones must provide a fresh, accurate location within roughly 50 metres.</Text>
    <Card><Text style={{ color: c.text, lineHeight: 22 }}>By choosing either option, you agree to send your current location for this check. Coordinates are encrypted in a code that expires in 60 seconds; they are not stored in our database or shown to the other person. Both of you still decide privately whether to connect.</Text></Card>
    {env.useMocks ? <Text style={{ color: c.muted }}>GPS verification requires signing into the live app. Demo mode cannot verify a meeting.</Text> : <>
      <Button label={busy ? 'Checking…' : 'Create my GPS code'} disabled={busy} onPress={() => void run(async () => {
        setScanning(false); setToken(null);
        const location = await locate();
        if (!active.current) return;
        const next = await api.gpsToken(location);
        if (active.current) setToken(next);
      })} />
      <Button label="Scan their GPS code" disabled={busy} onPress={() => void run(async () => {
        setToken(null);
        const result = permission?.granted ? permission : await requestPermission();
        if (!result.granted) throw new Error('Allow camera access to scan their code.');
        if (active.current) setScanning(true);
      })} />
    </>}
    {token && <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ padding: 16, backgroundColor: 'white' }}><QRCode value={`fcgps1:${token.code}`} size={240} /></View>
      <Text style={{ color: c.muted }}>Ask them to select GPS → Scan their GPS code. After they scan, open your conversation notification to give your own answer.</Text>
    </View>}
    {scanning && <CameraView style={{ height: 300 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
      if (locked.current) return;
      setScanning(false);
      void run(async () => {
        if (!data.startsWith('fcgps1:')) throw new Error('Use their GPS code, or switch to Scan code for a regular QR.');
        const location = await locate();
        if (!active.current) return;
        const result = await api.gpsVerify(data.slice(7), location, getCurrentEventId());
        if (active.current) onVerified(result);
      });
    }} />}
    {error && <Text accessibilityRole="alert" style={{ color: c.text }}>{error}</Text>}
    <Text style={{ color: c.muted }}>GPS checks device-reported proximity, not whether a conversation happened. Bluetooth phone-tap and regular QR remain available above.</Text>
  </ScrollView>;
}
