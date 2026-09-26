import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';
import { sendMagicLink, signInWithLinkedIn, useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

export default function SignInScreen() {
  const { continueAsGuest } = useAuth();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'linkedin' | 'email' | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const run = async (kind: 'linkedin' | 'email', fn: () => Promise<void>, success?: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      await fn();
      if (success) setMessage({ kind: 'info', text: success });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Formal Connection</Text>
        <Text style={styles.subtitle}>Meet the right people at HackGT 13.</Text>

        <Pressable
          style={[styles.button, { backgroundColor: '#0A66C2' }]}
          onPress={() => run('linkedin', signInWithLinkedIn)}
          disabled={busy !== null}
          accessibilityRole="button">
          {busy === 'linkedin' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonTextLight}>Continue with LinkedIn</Text>}
        </Pressable>

        <Text style={styles.or}>or get a sign-in link by email</Text>
        <TextInput
          style={[styles.input, { color: text, borderColor: '#8886' }]}
          placeholder="you@gatech.edu"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Pressable
          style={[styles.button, styles.outline, { borderColor: tint, opacity: validEmail ? 1 : 0.5 }]}
          onPress={() => run('email', () => sendMagicLink(email), 'Check your email and tap the link on this phone.')}
          disabled={!validEmail || busy !== null}
          accessibilityRole="button">
          {busy === 'email' ? <ActivityIndicator /> : <Text style={[styles.buttonText, { color: tint }]}>Email me a link</Text>}
        </Pressable>

        {message && <Text style={[styles.message, message.kind === 'error' && styles.error]}>{message.text}</Text>}

        {env.useMocks && (
          <Pressable onPress={continueAsGuest} style={styles.guest} accessibilityRole="button">
            <Text style={styles.guestText}>Skip sign-in (mock mode)</Text>
          </Pressable>
        )}

        <Text style={styles.disclosure}>
          We build your interest profile from what you share (resume, GitHub, what you type). To verify in-person
          conversations, the app privately records Bluetooth proximity to other attendees; raw readings are deleted after
          24 hours and nobody else sees them.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 17, opacity: 0.7, textAlign: 'center', marginBottom: 16 },
  button: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 2 },
  buttonText: { fontSize: 18, fontWeight: '600' },
  buttonTextLight: { fontSize: 18, fontWeight: '600', color: '#fff' },
  or: { textAlign: 'center', opacity: 0.6, marginTop: 8 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 18 },
  message: { textAlign: 'center', fontSize: 15 },
  error: { color: '#d33' },
  guest: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  guestText: { fontSize: 15, opacity: 0.6, textDecorationLine: 'underline' },
  disclosure: { fontSize: 12, opacity: 0.55, textAlign: 'center', marginTop: 12 },
});
