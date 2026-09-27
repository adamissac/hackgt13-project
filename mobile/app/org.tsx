import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export default function OrgScreen() {
  const c = useColors();
  const org = useAsync(() => api.myOrg(), []);
  const events = useAsync(() => api.listEvents(), []);
  const [name, setName] = useState('');
  const [eventName, setEventName] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCompany = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createOrg(name.trim());
      org.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createEvent = async () => {
    if (!eventName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { event } = await api.createEvent({ name: eventName.trim(), location: location.trim() });
      setEventName('');
      events.reload();
      router.push({ pathname: '/event/[id]', params: { id: String(event.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (org.state.status === 'loading') return <Loading label="Loading company…" />;
  if (org.state.status === 'error') return <ErrorState message={org.state.message} onRetry={org.reload} />;
  const company = org.state.data.org;
  const mine = events.state.status === 'ready' ? events.state.data.events.filter((e) => e.mine) : [];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>{company ? company.name : 'Company account'}</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Create an event, then show its check-in QR code at the entrance. Guests register in the app ahead of time and
        scan the code when they arrive. Only checked-in guests can see each other, and there’s no public attendee list.
      </Text>
      {!company ? (
        <Card>
          <Text style={[styles.body, { color: c.text }]}>Name your company</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Acme Recruiting"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.text, borderColor: c.border }]}
          />
          <Button label="Create company" onPress={createCompany} loading={busy} />
        </Card>
      ) : (
        <Card>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>New event</Text>
          <TextInput
            value={eventName}
            onChangeText={setEventName}
            placeholder="Fall career fair"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.text, borderColor: c.border }]}
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Building and room"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.text, borderColor: c.border }]}
          />
          <Button label="Create event" onPress={createEvent} loading={busy} />
        </Card>
      )}
      {mine.map((e) => (
        <Card key={e.id}>
          <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>{e.name}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{e.location || 'Location coming soon'}</Text>
          <Button label="Open event" variant="secondary" onPress={() => router.push({ pathname: '/event/[id]', params: { id: String(e.id) } })} />
        </Card>
      ))}
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, marginTop: 8, marginBottom: 8 },
});
