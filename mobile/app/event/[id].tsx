import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { setCurrentEventId } from '@/lib/currentEvent';
import { useAsync } from '@/lib/useAsync';

export default function EventScreen() {
  const c = useColors();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const events = useAsync(() => api.listEvents(), []);
  const matches = useAsync(
    async () => {
      await api.checkin(id).catch(() => undefined);
      return api.matches(id);
    },
    [id],
    ['relationships'],
  );
  const token = useAsync(async () => {
    try {
      return await api.eventJoinToken(id);
    } catch {
      return null;
    }
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (events.state.status === 'loading') return <Loading label="Loading event…" />;
  if (events.state.status === 'error') return <ErrorState message={events.state.message} onRetry={events.reload} />;
  const event = events.state.data.events.find((e) => e.id === id);
  if (!event) return <ErrorState message="Event not found." onRetry={events.reload} />;

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.registerEvent(id);
      await setCurrentEventId(id);
      events.reload();
      matches.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>{event.name}</Text>
      <Text style={[styles.body, { color: c.muted }]}>{event.host ? `Hosted by ${event.host}` : 'Company event'}</Text>
      <Text style={[styles.body, { color: c.muted }]}>{event.location || 'Location on site'}</Text>
      {!event.registered ? (
        <Button label="Register and enter" onPress={enter} loading={busy} />
      ) : (
        <Button
          label="Use this event for Nearby"
          variant="secondary"
          onPress={async () => {
            await setCurrentEventId(id);
            router.push('/nearby');
          }}
        />
      )}
      {token.state.status === 'ready' && token.state.data ? (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Event check-in QR</Text>
          <Text style={[styles.body, { color: c.muted }]}>People scan this to join the event. They are not added as connections.</Text>
          <View style={styles.qr}>
            <QRCode value={token.state.data.qr_payload} size={200} />
          </View>
        </Card>
      ) : null}
      <Text style={[styles.section, { color: c.text }]}>People at this event</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Same as Nearby: people registered and present, ranked for you. Not a searchable list of every attendee.
      </Text>
      {matches.state.status === 'loading' && <Loading label="Finding people…" />}
      {matches.state.status === 'error' && (
        <ErrorState
          message={matches.state.message}
          onRetry={() => {
            void enter();
          }}
        />
      )}
      {matches.state.status === 'ready' &&
        (matches.state.data.matches.length === 0 ? (
          <Card>
            <Text style={[styles.body, { color: c.text }]}>No one else is in this event yet.</Text>
          </Card>
        ) : (
          matches.state.data.matches.map((m) => (
            <Pressable
              key={m.user_id}
              onPress={() => router.push({ pathname: '/match/[id]', params: { id: m.user_id } })}
              accessibilityRole="button">
              <Card>
                <View style={styles.row}>
                  <Avatar name={m.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>{m.name}</Text>
                    <Text style={[styles.body, { color: c.muted }]}>{m.why.slice(0, 3).join(' · ')}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        ))}
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qr: { alignSelf: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 12, marginTop: 8 },
});
