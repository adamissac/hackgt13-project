import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Button, Card, useColors } from '@/components/ui';
import { appendMessage, isSuggestedOpener, type ChatMessage } from '@/features/chat/model';
import { loadThread, sendMessage, subscribeToMessages, type ChatThread } from '@/features/chat/store';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; other?: string; draft?: string }>();
  const chatId = Number(params.id);
  const invalid = !Number.isFinite(chatId);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(typeof params.draft === 'string' ? params.draft : '');
  const [sending, setSending] = useState(false);
  const [opener, setOpener] = useState<string | null>(null);
  const [openerHidden, setOpenerHidden] = useState(false);

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    loadThread(chatId, me)
      .then((next) => {
        if (cancelled) return;
        setThread(next);
        setError(null);
        setLoadedFor(chatId);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setThread(null);
        setError(e instanceof Error ? e.message : String(e));
        setLoadedFor(chatId);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, me, invalid]);

  const status = invalid ? 'error' : loadedFor !== chatId ? 'loading' : thread ? 'ready' : 'error';

  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    return subscribeToMessages(chatId, (message) => {
      setThread((current) => (current ? { ...current, messages: appendMessage(current.messages, message) } : current));
    });
  }, [chatId]);

  const otherId = thread?.other_user_id ?? params.other;
  useEffect(() => {
    if (!otherId) return;
    let cancelled = false;
    api
      .starters(otherId)
      .then((res) => {
        if (!cancelled) setOpener(res.openers[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setOpener(null);
      });
    return () => {
      cancelled = true;
    };
  }, [otherId]);

  const title = thread?.other_name ?? params.name ?? 'Chat';
  const showOpener = status === 'ready' && !!opener && !openerHidden && (thread?.messages.length ?? 0) === 0;

  const send = async (body: string) => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(chatId, me, text, isSuggestedOpener(text, opener));
      setThread((current) => (current ? { ...current, messages: appendMessage(current.messages, message) } : current));
      setDraft('');
      setOpenerHidden(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}>
      <Stack.Screen options={{ title }} />
      {status === 'loading' && <Loading label="Opening chat…" />}
      {status === 'error' && <ErrorState message={error ?? 'This chat is not available'} />}
      {status === 'ready' && thread && (
        <FlatList
          data={thread.messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            showOpener && opener ? (
              <Card highlight style={styles.openerCard}>
                <AiBadge label="Suggested opener" />
                <Text style={[styles.body, { color: c.text }]}>{opener}</Text>
                <View style={styles.openerActions}>
                  <Button label="Dismiss" variant="ghost" onPress={() => setOpenerHidden(true)} style={{ flex: 1 }} />
                  <Button label="Edit" variant="secondary" onPress={() => setDraft(opener)} style={{ flex: 1 }} />
                  <Button label="Send" onPress={() => send(opener)} loading={sending} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null
          }
          renderItem={({ item }) => <Bubble message={item} mine={item.sender_id !== thread.other_user_id} />}
          ListEmptyComponent={
            showOpener ? null : (
              <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>No messages yet. Say hello.</Text>
            )
          }
        />
      )}
      {status === 'ready' && (
        <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 12) }]}>
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={c.muted}
              style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]}
              accessibilityLabel="Message"
            />
            <Button label="Send" onPress={() => send(draft)} loading={sending} disabled={!draft.trim()} />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
      <View style={[styles.bubble, { backgroundColor: mine ? c.tint : c.surface, borderColor: mine ? c.tint : c.border }]}>
        {message.is_ai_draft && <Text style={[styles.draft, { color: mine ? c.onTint : c.ai }]}>Suggested opener</Text>}
        <Text style={[styles.body, { color: mine ? c.onTint : c.text }]}>{message.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  body: { fontSize: 16, lineHeight: 22 },
  openerCard: { width: '100%', flexDirection: 'column', alignItems: 'stretch' },
  openerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  bubbleWrap: { marginBottom: 8 },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  draft: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
});
