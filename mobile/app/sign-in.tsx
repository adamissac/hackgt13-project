import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';
import { sendMagicLink, signInWithLinkedIn, useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

export default function SignInScreen() {
  const { continueAsGuest } = useAuth();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Text style={[styles.brand, { color: tint }]}>formal connection</Text>
        <Text style={styles.title}>Less networking.{ '\n' }More connection.</Text>
        <Text style={[styles.subtitle, { color: muted }]}>Find your people at HackGT 13. Start with something you share.</Text>

        <Pressable
          style={[styles.button, { backgroundColor: tint }]}
          onPress={() => run('linkedin', signInWithLinkedIn)}
          disabled={busy !== null}
          accessibilityRole="button">
          {busy === 'linkedin' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonTextLight}>Continue with LinkedIn</Text>}
        </Pressable>

        <Text style={[styles.or, { color: muted }]}>or continue with email</Text>
        <TextInput
          style={[styles.input, { color: text, borderColor: '#8886' }]}
          placeholder="you@gatech.edu"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel="Email address"
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

        <Pressable onPress={continueAsGuest} style={styles.guest} accessibilityRole="button">
          <Text style={styles.guestText}>Try the demo (no account needed)</Text>
        </Pressable>

        <Text style={styles.disclosure}>
          We build your interest profile from what you share (resume, GitHub, what you type). To verify in-person
          conversations, the app privately records Bluetooth proximity to other attendees; raw readings are deleted after
          24 hours and nobody else sees them.
        </Text>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center' },
  container: { justifyContent: 'center', padding: 28, paddingVertical: 56, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
  brand: { fontSize: 18, fontWeight: '600', letterSpacing: -0.5, marginBottom: 32 },
  title: { fontSize: 38, lineHeight: 44, fontWeight: '500', letterSpacing: -1.5 },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: 20 },
  button: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 18, fontWeight: '600' },
  buttonTextLight: { fontSize: 18, fontWeight: '600', color: '#fff' },
  or: { textAlign: 'center', marginTop: 8, fontSize: 13 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 18 },
  message: { textAlign: 'center', fontSize: 15 },
  error: { color: '#d33' },
  guest: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  guestText: { fontSize: 15, opacity: 0.6, textDecorationLine: 'underline' },
  disclosure: { fontSize: 12, lineHeight: 18, opacity: 0.75, marginTop: 12 },
});
