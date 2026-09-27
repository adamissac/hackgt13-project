import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { rememberJoinCode } from '@/lib/joinCodes';

export default function NewCompanyEvent() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [promo, setPromo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { event } = await api.createOrgEvent({
        name: name.trim(),
        location: location.trim(),
        starts_at: startsAt.trim() || undefined,
        ends_at: endsAt.trim() || undefined,
        description: description.trim(),
        promo: promo.trim(),
      });
      rememberJoinCode(event.id, event.join_code);
      router.replace({
        pathname: '/(company)/event/[id]',
        params: { id: String(event.id), code: event.join_code ?? '' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: 88 + insets.bottom }]}>
      <Text style={[styles.title, { color: c.text }]}>New event</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        We’ll make a join code and QR. Share those — people who enter the code are in this event, not in your connections.
      </Text>
      <Card>
        <Field label="Event name" value={name} onChange={setName} placeholder="Fall career night" />
        <Field label="Where" value={location} onChange={setLocation} placeholder="Klaus atrium" />
        <Field label="Starts (optional)" value={startsAt} onChange={setStartsAt} placeholder="2026-09-27 18:00" />
        <Field label="Ends (optional)" value={endsAt} onChange={setEndsAt} placeholder="2026-09-27 21:00" />
        <Field label="What attendees should know" value={description} onChange={setDescription} placeholder="Talk to three teams. Open to juniors." multiline />
        <Field label="One-line promo" value={promo} onChange={setPromo} placeholder="Hiring SWE and PM interns" />
        <Button label="Create event" onPress={create} loading={busy} />
        {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
      </Card>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const c = useColors();
  return (
    <>
      <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        multiline={multiline}
        style={{
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: c.text,
          fontSize: 16,
          marginBottom: 8,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
});
