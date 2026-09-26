import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, useColors } from '@/components/ui';
import { metLine } from '@/features/checklist/met';
import { listChats } from '@/features/chat/store';
import { api, type Connection } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// AD8: the caller's own connections. How you met and what you talked about.
// No one else's list or count is on this screen.
export default function ConnectionsScreen() {
  const c = useColors();
  const { state, reload } = useAsync(() => api.connections(), [], ['connections']);
  const [opening, setOpening] = useState<string | null>(null);

  const openChat = async (person: Connection) => {
    setOpening(person.user_id);
    try {
      const chats = await listChats('');
      const chat = chats.find((row) => row.other_user_id === person.user_id);
      if (!chat) {
        router.push('/chats');
        return;
      }
      router.push({ pathname: '/chat/[id]', params: { id: String(chat.id), name: person.name, other: person.user_id } });
    } finally {
      setOpening(null);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.lead, { color: c.muted }]}>Only you can see who you’ve connected with.</Text>
      {state.status === 'loading' && <Loading label="Loading your connections…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.connections.length === 0 && (
        <Card>
          <Text style={[styles.title, { color: c.text }]}>No connections yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            After a real conversation, both of you say yes on the checklist. Or invite someone you already know.
          </Text>
          <Button label="Verify a conversation" variant="secondary" onPress={() => router.push('/verify')} />
        </Card>
      )}
      {state.status === 'ready' &&
        state.data.connections.map((person) => (
          <Card key={person.user_id}>
            <View style={styles.row}>
              <Avatar name={person.name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: c.text }]}>{person.name}</Text>
                {!!person.headline && <Text style={[styles.body, { color: c.muted }]}>{person.headline}</Text>}
                <Text style={[styles.body, { color: c.muted }]}>{metLine(person)}</Text>
              </View>
            </View>
            {person.talked_about.length > 0 && (
              <View style={styles.chips}>
                {person.talked_about.map((topic) => (
                  <Chip key={topic} label={topic} />
                ))}
              </View>
            )}
            {person.minutes_talked > 0 && (
              <Text style={[styles.body, { color: c.muted }]}>You talked for about {person.minutes_talked} minutes.</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label="Message"
                variant="secondary"
                onPress={() => openChat(person)}
                loading={opening === person.user_id}
                style={{ flex: 1 }}
              />
              <Button
                label="✦ Ask AI"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/assistant', params: { q: `How should I follow up with ${person.name.split(' ')[0]}?` } })
                }
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  lead: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
