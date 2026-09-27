import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Button, Card, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/useOrg';

const INDUSTRIES = ['Technology', 'Finance', 'Consulting', 'Healthcare', 'Hardware', 'Consumer', 'Climate', 'Education', 'Government', 'Other'];
const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

export default function CompanyProfile() {
  const c = useColors();
  const { loading, error, org, reload } = useOrg();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return <Loading label="Loading company…" />;
  if (error || !org) return <ErrorState message={error ?? 'No company on this account.'} onRetry={reload} />;
  const form = draft ?? {
    name: org.name,
    website: org.website,
    industry: org.industry,
    city: org.city,
    about: org.about,
    size_band: org.size_band,
    contact_name: org.contact_name,
  };

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      await api.patchOrg(form);
      setDraft(null);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: c.text }]}>{org.name}</Text>
      <Text style={[styles.body, { color: c.muted }]}>Work email {org.contact_email}. Not verified in this demo.</Text>
      <Card>
        {(['name', 'contact_name', 'website', 'city'] as const).map((key) => (
          <Field
            key={key}
            label={key === 'name' ? 'Company name' : key === 'contact_name' ? 'Your name' : key === 'website' ? 'Website' : 'City'}
            value={form[key]}
            onChange={(v) => setDraft({ ...form, [key]: v })}
          />
        ))}
        <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 }}>Industry</Text>
        <ChipRow values={INDUSTRIES} current={form.industry} onPick={(v) => setDraft({ ...form, industry: v })} />
        <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 }}>Company size</Text>
        <ChipRow values={SIZES} current={form.size_band} onPick={(v) => setDraft({ ...form, size_band: v })} />
        <Field label="About / who you hire" value={form.about} onChange={(v) => setDraft({ ...form, about: v })} multiline />
        <Button label="Save company" onPress={save} loading={busy} />
        {saveError ? <Text style={{ color: c.danger }}>{saveError}</Text> : null}
      </Card>
      <Button label="Sign out" variant="ghost" onPress={() => void supabase.auth.signOut()} />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const c = useColors();
  return (
    <>
      <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        style={{
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          color: c.text,
          fontSize: 16,
        }}
      />
    </>
  );
}

function ChipRow({ values, current, onPick }: { values: string[]; current: string; onPick: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {values.map((v) => (
        <Pressable key={v} onPress={() => onPick(v)} accessibilityRole="button">
          <Text
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 14,
              overflow: 'hidden',
              marginRight: 6,
              marginBottom: 6,
              backgroundColor: current === v ? c.tint : c.surfaceAlt,
              color: current === v ? c.onTint : c.text,
              fontWeight: '700',
              fontSize: 12,
            }}>
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
});
