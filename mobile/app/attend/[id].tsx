import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, useColors } from '@/components/ui';
import { EventModeCard } from '@/features/ble/EventModeCard';
import { api } from '@/lib/api';
import { setCurrentEventId } from '@/lib/currentEvent';
import { useAsync } from '@/lib/useAsync';

export default function EventScreen() {
  const c = useColors();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const events = useAsync(() => api.listEvents(), []);
  // People here only after you check in by scanning the organizer's QR (registering alone isn't enough).
  const matches = useAsync(
    async () => {
      const mine = (await api.listEvents()).events.find((e) => e.id === id);
      return mine?.checked_in ? api.matches(id) : null;
    },
    [id],
    ['relationships'],
  );
  const updates = useAsync(() => api.eventUpdates(id).catch(() => ({ event_id: id, promo: '', description: '', posts: [] })), [id]);
  const token = useAsync(async () => {
    try {
      return await api.eventJoinToken(id);
    } catch {
      return null;
    }
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedIn = events.state.status === 'ready' && !!events.state.data.events.find((e) => e.id === id)?.checked_in;
  // In the session, Event Mode, Nearby and matches all use this event.
  useEffect(() => {
    if (checkedIn) void setCurrentEventId(id);
  }, [checkedIn, id]);

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
      {(event.description || (updates.state.status === 'ready' && updates.state.data.description)) ? (
        <Text style={[styles.body, { color: c.text }]}>
          {event.description || (updates.state.status === 'ready' ? updates.state.data.description : '')}
        </Text>
      ) : null}
      {(event.promo || (updates.state.status === 'ready' && updates.state.data.promo)) ? (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>From the host</Text>
          <Text style={[styles.body, { color: c.text }]}>
            {event.promo || (updates.state.status === 'ready' ? updates.state.data.promo : '')}
          </Text>
        </Card>
      ) : null}
      {updates.state.status === 'ready' && updates.state.data.posts.length > 0 ? (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Event updates</Text>
          {updates.state.data.posts.map((p) => (
            <Text key={p.id} style={[styles.body, { color: c.muted, marginTop: 8 }]}>
              {p.body}
            </Text>
          ))}
        </Card>
      ) : null}
      {!event.registered ? (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Register to attend</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            Registering adds this event to your calendar. At the event, you’ll scan the company’s QR code to enter the session.
          </Text>
          <Button label="Register" onPress={enter} loading={busy} />
        </Card>
      ) : !event.checked_in ? (
        <View style={[styles.scanCard, { backgroundColor: c.tint }]}>
          <Text style={styles.scanEyebrow}>REGISTERED · ON YOUR CALENDAR</Text>
          <Text style={styles.scanTitle}>At the event? Scan in.</Text>
          <Text style={styles.scanBody}>
            Scan the QR code the company shows at the entrance to enter the session. Until you do, other attendees can’t
            see you.
          </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/join-event', params: { event: String(id) } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.scanButton, { opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[styles.scanButtonText, { color: c.tint }]}>Scan QR code</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={[styles.sessionCard, { backgroundColor: c.tintSoft, borderColor: c.tint }]}>
            <View style={styles.row}>
              <View style={[styles.liveDot, { backgroundColor: c.success }]} />
              <Text style={[styles.body, { color: c.tint, fontWeight: '800' }]}>You’re in the session</Text>
            </View>
            <Text style={[styles.body, { color: c.ai }]}>
              Everyone below registered and scanned in, just like you. Turn on Event Mode to find them in the room.
            </Text>
          </View>
          <EventModeCard />
          <Button label="See who’s close on the map" variant="secondary" onPress={() => router.push('/nearby')} />
        </View>
      )}
      {token.state.status === 'ready' && token.state.data ? (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>Event check-in QR</Text>
          <Text style={[styles.body, { color: c.muted }]}>Show this at the entrance. Registered guests scan it to check in. Scanning doesn’t connect anyone.</Text>
          <View style={styles.qr}>
            <QRCode value={token.state.data.qr_payload} size={200} />
          </View>
        </Card>
      ) : null}
      <Text style={[styles.section, { color: c.text }]}>{checkedIn ? 'People in this session' : 'People at this event'}</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Only people who registered and scanned in, ranked for you. Not a searchable list of every attendee.
      </Text>
      {matches.state.status === 'loading' && <Loading label="Finding people…" />}
      {matches.state.status === 'ready' && matches.state.data === null && (
        <Card>
          <Text style={[styles.body, { color: c.muted }]}>Check in with the event QR code to see who’s here.</Text>
        </Card>
      )}
      {matches.state.status === 'error' && (
        <ErrorState
          message={matches.state.message}
          onRetry={matches.reload}
        />
      )}
      {matches.state.status === 'ready' &&
        matches.state.data !== null &&
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {m.why.slice(0, 3).map((w) => <Chip key={w} label={w} tone="tint" />)}
                    </View>
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
  scanCard: { borderRadius: 22, padding: 20, gap: 10 },
  scanEyebrow: { color: '#B6C9FA', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  scanTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  scanBody: { color: '#D3DEF2', fontSize: 15, lineHeight: 22 },
  scanButton: { backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  scanButtonText: { fontSize: 17, fontWeight: '800' },
  sessionCard: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 6 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  qr: { alignSelf: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 12, marginTop: 8 },
});
