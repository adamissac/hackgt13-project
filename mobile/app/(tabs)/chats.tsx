import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, useColors } from '@/components/ui';
import { listChats } from '@/features/chat/store';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { useAsync } from '@/lib/useAsync';

export default function ChatsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { state, reload } = useAsync(() => listChats(me), [me, env.useMocks], ['chats', 'relationships']);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={[styles.lead, { color: c.muted }]}>
        A chat opens only after you both say yes. Nobody else can see these.
      </Text>
      {state.status === 'loading' && <Loading label="Loading your chats…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <Card>
          <Text style={[styles.title, { color: c.text }]}>No chats yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            When you and someone both want to meet, the conversation shows up here.
          </Text>
          <Button label="Find people to meet" variant="secondary" onPress={() => router.push('/nearby')} />
        </Card>
      )}
      {state.status === 'ready' &&
        state.data.map((chat) => (
          <Pressable
            key={chat.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/chat/[id]',
                params: { id: String(chat.id), name: chat.other_name, other: chat.other_user_id },
              })
            }>
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                <View style={styles.row}>
                  <Avatar name={chat.other_name} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={[styles.title, { color: c.text, flex: 1 }]} numberOfLines={1}>{chat.other_name}</Text>
                      {chat.last_at && <Text style={[styles.time, { color: c.muted }]}>{ago(chat.last_at)}</Text>}
                    </View>
                    <Text style={[styles.body, { color: c.muted }]} numberOfLines={1}>
                      {chat.last_body ?? 'Say hi — an opener is ready if you want it.'}
                    </Text>
                  </View>
                </View>
              </Card>
            )}
          </Pressable>
        ))}
    </ScrollView>
  );
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const styles = StyleSheet.create({
  time: { fontSize: 12, fontWeight: '600' },
  container: { padding: 16, gap: 12 },
  lead: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
});
