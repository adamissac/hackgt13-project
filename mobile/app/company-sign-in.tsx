import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Brand } from '@/components/Brand';
import { Text, View, useThemeColor } from '@/components/Themed';
import { api } from '@/lib/api';
import { signInWithPassword } from '@/lib/auth';

const INDUSTRIES = ['Technology', 'Finance', 'Consulting', 'Healthcare', 'Hardware', 'Consumer', 'Climate', 'Education', 'Government', 'Other'];
const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

export default function CompanySignIn() {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const [mode, setMode] = useState<'login' | 'create'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    password: '',
    website: '',
    industry: 'Technology',
    city: '',
    about: '',
    size_band: '11-50',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(form.contact_email, form.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.companySignup(form);
      await signInWithPassword(form.contact_email, form.password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (/already has an account/i.test(msg)) setMode('login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Brand />
          <Text style={styles.title}>Company workspace</Text>
          <Text style={[styles.sub, { color: muted }]}>
            Separate from attendee sign-in. Create events, send join codes, promote. We won’t verify the work email in this demo.
          </Text>
          <View style={styles.switch}>
            <Pressable accessibilityRole="button" onPress={() => setMode('create')} style={[styles.sw, mode === 'create' && { backgroundColor: tint }]}>
              <Text style={{ color: mode === 'create' ? '#fff' : text, fontWeight: '700' }}>Create company</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setMode('login')} style={[styles.sw, mode === 'login' && { backgroundColor: tint }]}>
              <Text style={{ color: mode === 'login' ? '#fff' : text, fontWeight: '700' }}>Sign in</Text>
            </Pressable>
          </View>

          {mode === 'create' && (
            <>
              <Field label="Company name" value={form.company_name} onChange={(v) => set('company_name', v)} placeholder="Acme Labs" />
              <Field label="Your name" value={form.contact_name} onChange={(v) => set('contact_name', v)} placeholder="Jordan Lee" />
              <Field label="Work email" value={form.contact_email} onChange={(v) => set('contact_email', v)} placeholder="jordan@acme.com" email />
              <Field label="Password (8+ characters)" value={form.password} onChange={(v) => set('password', v)} placeholder="••••••••" password />
              <Field label="Website" value={form.website} onChange={(v) => set('website', v)} placeholder="https://acme.com" />
              <Field label="City" value={form.city} onChange={(v) => set('city', v)} placeholder="Atlanta" />
              <Text style={[styles.label, { color: muted }]}>Industry</Text>
              <ChipRow values={INDUSTRIES} current={form.industry} onPick={(v) => set('industry', v)} tint={tint} text={text} />
              <Text style={[styles.label, { color: muted }]}>Company size</Text>
              <ChipRow values={SIZES} current={form.size_band} onPick={(v) => set('size_band', v)} tint={tint} text={text} />
              <Field label="Who you hire / about the company" value={form.about} onChange={(v) => set('about', v)} placeholder="SWE and PM interns. Campus recruiting." multiline />
              <Pressable
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
                onPress={create}
                disabled={busy || form.company_name.length < 2 || form.password.length < 8}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.light}>Create company account</Text>}
              </Pressable>
            </>
          )}

          {mode === 'login' && (
            <>
              <Field label="Work email" value={form.contact_email} onChange={(v) => set('contact_email', v)} placeholder="jordan@acme.com" email />
              <Field label="Password" value={form.password} onChange={(v) => set('password', v)} placeholder="••••••••" password />
              <Pressable
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
                onPress={login}
                disabled={busy || form.password.length < 8}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.light}>Sign in to company</Text>}
              </Pressable>
            </>
          )}
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  email,
  password,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  email?: boolean;
  password?: boolean;
  multiline?: boolean;
}) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  return (
    <>
      <Text style={[styles.label, { color: muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoComplete={email ? 'email' : password ? 'password' : 'off'}
        keyboardType={email ? 'email-address' : 'default'}
        secureTextEntry={password}
        multiline={multiline}
        style={[styles.input, { color: text, minHeight: multiline ? 88 : 52 }]}
      />
    </>
  );
}

function ChipRow({
  values,
  current,
  onPick,
  tint,
  text,
}: {
  values: string[];
  current: string;
  onPick: (v: string) => void;
  tint: string;
  text: string;
}) {
  return (
    <View style={styles.chips}>
      {values.map((v) => (
        <Pressable key={v} onPress={() => onPick(v)} style={[styles.chip, current === v && { backgroundColor: tint }]}>
          <Text style={{ color: current === v ? '#fff' : text, fontWeight: '700', fontSize: 12 }}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: { padding: 24, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center', paddingVertical: 40 },
  title: { fontSize: 32, fontWeight: '600', letterSpacing: -1 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  switch: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  sw: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#8886', borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  light: { color: '#fff', fontSize: 17, fontWeight: '700' },
  err: { color: '#d33', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: '#eee' },
});
