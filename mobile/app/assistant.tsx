import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, useColors } from '@/components/ui';
import { api, type AssistantMessage } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';

const PROMPTS = ['Who should I meet?', 'Who here works on RAG?', 'Help me talk to a recruiter', 'Who is into quant?'];

// AI assistant (MASTER_SPEC 6.12). Live: POST /assistant/chat, Claude with server-scoped tools (people
// you can already see, your profile, your connections). It never reveals anyone's connections or a "no".
export default function AssistantScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ q?: string }>();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const handledQ = useRef<string | null>(null);

  const ask = async (text: string, history = messages) => {
    const q = text.trim();
    if (!q || sending) return;
    const next = [...history, { role: 'user' as const, content: q }];
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

  // "Ask AI" buttons elsewhere open this tab with ?q=...; ask it once.
  useEffect(() => {
    if (!params.q || handledQ.current === params.q) return;
    handledQ.current = params.q;
    const t = setTimeout(() => {
      void ask(params.q!);
      router.setParams({ q: undefined });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const history = messages.slice(0, messages.lastIndexOf(lastUser));
    void ask(lastUser.content, history);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.welcome, { backgroundColor: c.aiSoft }]}>
          <Text style={[styles.welcomeTitle, { color: c.ai }]}>✦ Your networking assistant</Text>
          <Text style={[styles.body, { color: c.text }]}>
            I can help you figure out who to meet here and what to talk about. I only know about people you can already see.
          </Text>
        </View>

        {messages.length === 0 && (
          <View style={styles.prompts}>
            {PROMPTS.map((p) => (
              <Pressable
                key={p}
                onPress={() => ask(p)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.prompt, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.promptText, { color: c.text }]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((m, i) => {
          const mine = m.role === 'user';
          return (
            <View key={`${m.role}-${i}`} style={mine ? styles.mine : styles.theirs}>
              {!mine && <Text style={[styles.who, { color: c.ai }]}>✦ Assistant</Text>}
              <View style={[styles.bubble, mine ? { backgroundColor: c.tint } : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
                <Text style={[styles.body, { color: mine ? c.onTint : c.text }]}>{m.content}</Text>
              </View>
            </View>
          );
        })}

        {sending && (
          <View style={[styles.theirs]}>
            <View style={[styles.bubble, styles.typing, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
              <ActivityIndicator size="small" color={c.ai} />
              <Text style={[styles.small, { color: c.muted }]}>Thinking…</Text>
            </View>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { borderColor: c.danger }]}>
            <Text style={[styles.small, { color: c.danger, flex: 1 }]}>
              {/unavailable|503/i.test(error) ? 'The assistant is unavailable right now.' : error}
            </Text>
            <Button label="Retry" variant="ghost" onPress={retry} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about people here…"
          placeholderTextColor={c.muted}
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]}
          accessibilityLabel="Question for the assistant"
          returnKeyType="send"
          onSubmitEditing={() => ask(draft)}
          editable={!sending}
        />
        <Button label="Ask" onPress={() => ask(draft)} loading={sending} disabled={!draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  welcome: { borderRadius: 18, padding: 16, gap: 6 },
  welcomeTitle: { fontSize: 16, fontWeight: '800' },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prompt: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  promptText: { fontSize: 15, fontWeight: '600' },
  mine: { alignItems: 'flex-end' },
  theirs: { alignItems: 'flex-start', gap: 4 },
  who: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  input: { flex: 1, minHeight: 48, borderRadius: 14, paddingHorizontal: 14, fontSize: 16 },
});
