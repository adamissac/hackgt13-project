import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { lastJoinCode, rememberJoinCode } from '@/lib/joinCodes';
import { useAsync } from '@/lib/useAsync';

export default function CompanyEventStudio() {
  const c = useColors();
  const params = useLocalSearchParams<{ id: string; code?: string }>();
  const id = Number(params.id);
  if (params.code) rememberJoinCode(id, params.code);
  const studio = useAsync(() => api.eventStudio(id), [id]);
  const [code, setCode] = useState<string | null>(lastJoinCode(id) ?? params.code ?? null);
  const [promo, setPromo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (studio.state.status === 'loading') return <Loading label="Loading studio…" />;
  if (studio.state.status === 'error') return <ErrorState message={studio.state.message} onRetry={studio.reload} />;
  const { event, join, posts } = studio.state.data;
  const shownCode = code ?? event.join_code;

  const rotate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = (await api.rotateJoinCode(id)).join_code;
      rememberJoinCode(id, next);
      setCode(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendPromo = async () => {
    if (!promo.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.promoteEvent(id, promo.trim());
      setPromo('');
      studio.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const share = () => {
    const bits = [`Join ${event.name} on Constellation.`];
    if (shownCode) bits.push(`Code: ${shownCode}`);
    bits.push('Enter the code in the app under Events → Join an event. Scanning the QR also works. It does not add you as a connection.');
    void Share.share({ message: bits.join(' ') });
  };

  const copyCode = async () => {
    if (!shownCode) return;
    await Clipboard.setStringAsync(shownCode);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>{event.name}</Text>
      <Text style={[styles.body, { color: c.muted }]}>{event.location || 'Location TBD'}</Text>
      <View style={styles.row}>
        <Card style={{ flex: 1 }}>
          <Text style={[styles.num, { color: c.text }]}>{event.registered}</Text>
          <Text style={[styles.body, { color: c.muted }]}>Registered</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={[styles.num, { color: c.text }]}>{event.checked_in}</Text>
          <Text style={[styles.body, { color: c.muted }]}>In the room</Text>
        </Card>
      </View>
      <Card>
        <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Join code & QR</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          People enter the code or scan the QR. That signs them into this event. It does not connect them to anyone.
        </Text>
        {shownCode ? <Text style={[styles.code, { color: c.text }]}>{shownCode}</Text> : (
          <Text style={[styles.body, { color: c.muted }]}>Tap new code to mint one you can print.</Text>
        )}
        <View style={styles.qr}>
          <QRCode value={join.qr_payload} size={180} />
        </View>
        <Button label="Share invite" variant="secondary" onPress={share} />
        {shownCode ? <Button label="Copy code" variant="ghost" onPress={() => void copyCode()} /> : null}
        <Button label={shownCode ? 'New code' : 'Make a code'} variant="ghost" onPress={rotate} loading={busy} />
      </Card>
      <Card>
        <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Promote</Text>
        <Text style={[styles.body, { color: c.muted }]}>A short update for people already registered. Not a group chat.</Text>
        <TextInput
          value={promo}
          onChangeText={setPromo}
          placeholder="Talks start at 2. Booth 14 is hiring."
          placeholderTextColor={c.muted}
          multiline
          style={[styles.input, { color: c.text, borderColor: c.border }]}
        />
        <Button label="Post to attendees" onPress={sendPromo} loading={busy} />
        {posts.map((p) => (
          <Text key={p.id} style={[styles.body, { color: c.muted, marginTop: 8 }]}>
            {p.body}
          </Text>
        ))}
      </Card>
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  num: { fontSize: 28, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 2, marginVertical: 8 },
  qr: { alignSelf: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 12, marginVertical: 8 },
  input: { minHeight: 80, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, marginVertical: 8 },
});
