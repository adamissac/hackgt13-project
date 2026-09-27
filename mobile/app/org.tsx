import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export default function OrgScreen() {
  const c = useColors();
  const events = useAsync(() => api.listEvents(), []);

  if (events.state.status === 'loading') return <Loading label="Loading events…" />;
  if (events.state.status === 'error') return <ErrorState message={events.state.message} onRetry={events.reload} />;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>Company events</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Companies have a separate login. If you run a company, sign out and tap Company on the sign-in screen.
        If you were invited, enter their join code, or register here and scan the QR at the door. That puts you in
        the event, not their connections. Only checked-in guests can see each other.
      </Text>
      <Button label="Enter a join code" onPress={() => router.push('/join-event')} />
      {events.state.data.events.map((e) => (
        <Card key={e.id}>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>{e.name}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{e.host ? `Hosted by ${e.host}` : 'Company event'}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{e.location || 'Location on site'}</Text>
          {e.promo ? <Text style={[styles.body, { color: c.text }]}>{e.promo}</Text> : null}
          <Button
            label={e.registered ? 'Open event' : 'View event'}
            variant="secondary"
            onPress={() => router.push({ pathname: '/attend/[id]', params: { id: String(e.id) } })}
          />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
});
