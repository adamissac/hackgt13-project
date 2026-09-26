import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Card, useColors } from '@/components/ui';
import { api, type AppNotification } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

const ICON: Record<string, string> = {
  suggestion: '✦',
  mutual_meet: '🎉',
  new_message: '💬',
  conversation_verified: '✓',
  connect_prompt: '✓',
  connected: '🤝',
  invite: '✉️',
  event: '📍',
  event_update: '📍',
  connection_attending: '📍',
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// In-app notification center: matches, mutual yeses, messages, verified conversations, connections.
export default function NotificationsScreen() {
  const c = useColors();
  const { state, reload } = useAsync(() => api.notifications(), [], ['notifications']);

  // Opening the list marks everything read (clears the bell badge).
  const hasUnread = state.status === 'ready' && state.data.some((n) => !n.read);
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(() => api.markNotificationsRead().catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, [hasUnread]);

  const open = (n: AppNotification) => {
    if (n.route) router.push(n.route as Href);
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {state.status === 'loading' && <Loading label="Loading notifications…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <Card>
          <Text style={[styles.title, { color: c.text }]}>You’re all caught up</Text>
          <Text style={[styles.body, { color: c.muted }]}>Matches, messages, and connection updates show up here.</Text>
        </Card>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {state.data.map((n, i) => (
            <Pressable
              key={n.id}
              onPress={() => open(n)}
              disabled={!n.route}
              accessibilityRole={n.route ? 'button' : undefined}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                pressed && { opacity: 0.7 },
              ]}>
              <View style={[styles.icon, { backgroundColor: n.read ? c.surfaceAlt : c.tintSoft }]}>
                <Text style={{ fontSize: 18, color: c.tint }}>{ICON[n.kind] ?? '•'}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.title, { color: c.text, fontWeight: n.read ? '600' : '800' }]}>{n.title}</Text>
                {!!n.body && (
                  <Text style={[styles.body, { color: c.muted }]} numberOfLines={2}>
                    {n.body}
                  </Text>
                )}
              </View>
              <Text style={[styles.time, { color: c.muted }]}>{ago(n.created_at)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 64 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16 },
  body: { fontSize: 14, lineHeight: 19 },
  time: { fontSize: 12, fontWeight: '600' },
});
