import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, useColors } from '@/components/ui';
import { api, type AssistantMessage } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';

// Asks the ML server. The model only receives people this user is already allowed to see.
export default function AssistantScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setDraft('');
    setSending(true);
    setError(null);
    try {
      const res = await api.assistantChat(next, HACKGT_EVENT_ID);
      setMessages([...next, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.lead, { color: c.muted }]}>
          Ask about people you can already see at HackGT. It won’t reveal anyone’s connections or a no.
        </Text>
        {messages.length === 0 && (
          <Card>
            <Text style={[styles.body, { color: c.text }]}>Try: “Who here works on reinforcement learning?”</Text>
          </Card>
        )}
        {messages.map((message, index) => (
          <View key={`${message.role}-${index}`} style={message.role === 'user' ? styles.mine : styles.theirs}>
            <View style={[styles.bubble, { backgroundColor: message.role === 'user' ? c.tint : c.surface, borderColor: message.role === 'user' ? c.tint : c.border }]}>
              <Text style={[styles.body, { color: message.role === 'user' ? c.onTint : c.text }]}>{message.content}</Text>
            </View>
          </View>
        ))}
        {error && <Text style={{ color: c.danger }}>{error}</Text>}
      </ScrollView>
      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask something"
          placeholderTextColor={c.muted}
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]}
          accessibilityLabel="Question"
        />
        <Button label="Ask" onPress={send} loading={sending} disabled={!draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 10, paddingBottom: 24 },
  lead: { fontSize: 15, lineHeight: 21 },
  body: { fontSize: 16, lineHeight: 22 },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
});
