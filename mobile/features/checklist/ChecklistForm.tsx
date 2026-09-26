import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Card, useColors } from '@/components/ui';
import { api, type ConversationFeedbackResponse } from '@/lib/api';

// Post-conversation checklist (AD8, MASTER_SPEC 3.6). A yes looks the same until both say yes.
// Someone who said no is told nothing was sent. The other person gets no signal either way.
export function ChecklistForm({
  conversationId,
  name,
  checklist,
  onAgain,
}: {
  conversationId: number;
  name: string;
  checklist: { interest_id: number; name: string }[];
  onAgain?: () => void;
}) {
  const c = useColors();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ConversationFeedbackResponse | null>(null);
  const [note, setNote] = useState('');
  const [noteState, setNoteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async (wantsConnect: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setOutcome(
        await api.conversationFeedback(conversationId, {
          talked_about: [...picked],
          other_topic: other.trim(),
          wants_connect: wantsConnect,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadNote = async (userId: string) => {
    setNoteState('loading');
    try {
      const res = await api.followupDraft(userId);
      setNote(res.draft);
      setNoteState('ready');
    } catch (e) {
      setNoteState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (outcome) {
    const connected = outcome.status === 'connected' ? outcome : null;
    return (
      <ScrollView contentContainerStyle={styles.verified}>
        <View style={styles.center}>
          <Avatar name={name} size={72} />
          {connected ? (
            <Text style={[styles.title, { color: c.text }]}>You’re connected with {connected.connection.name}</Text>
          ) : outcome.status === 'waiting' ? (
            <>
              <Text style={[styles.title, { color: c.text }]}>Thanks. We’ll let you know</Text>
              <Text style={[styles.muted, { color: c.muted }]}>If {name} also wants to connect, you’ll both be notified.</Text>
            </>
          ) : (
            <Text style={[styles.title, { color: c.text }]}>Got it. Nothing was sent to {name}.</Text>
          )}
        </View>
        {connected && (
          <Card>
            <Text style={[styles.body, { color: c.text }]}>A private chat is open. A follow-up note is ready if you want to send one.</Text>
            <Button
              label={`Chat with ${connected.connection.name.split(' ')[0]}`}
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: String(connected.chat_id), name: connected.connection.name, other: connected.connection.user_id, draft: note },
                })
              }
            />
            {noteState === 'idle' && (
              <Button label="Draft a follow-up" variant="secondary" onPress={() => loadNote(connected.connection.user_id)} />
            )}
            {noteState === 'loading' && <Button label="Writing a note…" variant="secondary" onPress={() => undefined} loading />}
            {noteState === 'ready' && (
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
                accessibilityLabel="Follow-up note"
              />
            )}
          </Card>
        )}
        {onAgain && <Button label="Verify someone else" variant="secondary" onPress={onAgain} />}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.verified}>
      <View style={styles.header}>
        <Avatar name={name} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text, textAlign: 'left' }]}>You talked with {name}</Text>
          <Text style={[styles.muted, { color: c.muted, textAlign: 'left' }]}>Verified in person</Text>
        </View>
      </View>

      <Card>
        <Text style={[styles.body, { color: c.text, textAlign: 'left' }]}>What did you talk about?</Text>
        {checklist.map((topic) => {
          const on = picked.has(topic.interest_id);
          return (
            <Pressable
              key={topic.interest_id}
              onPress={() => toggle(topic.interest_id)}
              style={[styles.check, { borderColor: on ? c.tint : c.border, backgroundColor: on ? c.tintSoft : 'transparent' }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}>
              <Text style={[styles.checkText, { color: on ? c.tint : c.text, fontWeight: on ? '700' : '500' }]}>
                {on ? '✓ ' : ''}
                {topic.name}
              </Text>
            </Pressable>
          );
        })}
        <TextInput
          value={other}
          onChangeText={setOther}
          placeholder="Something else? (optional)"
          placeholderTextColor={c.muted}
          maxLength={120}
          style={[styles.input, { color: c.text, borderColor: c.border }]}
        />
      </Card>

      <Text style={[styles.question, { color: c.text }]}>Do you want to connect with {name}?</Text>
      <Text style={[styles.muted, { color: c.muted }]}>They only find out if you both say yes.</Text>
      {error ? <Text style={[styles.body, { color: c.danger }]}>{error}</Text> : null}
      <Button label="Yes, connect" onPress={() => send(true)} loading={busy} />
      <Button label="No thanks" variant="ghost" onPress={() => send(false)} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  verified: { padding: 20, gap: 14, paddingBottom: 40 },
  center: { alignItems: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  muted: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  question: { fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  check: { minHeight: 48, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', marginTop: 8 },
  checkText: { fontSize: 16 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginTop: 8 },
});
