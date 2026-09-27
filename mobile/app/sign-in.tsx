import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";

import { InstallHint } from "@/components/InstallHint";
import { Text, View, useThemeColor } from "@/components/Themed";
import {
  enabledProviders,
  sendMagicLink,
  signInWithGitHub,
  signInWithGoogle,
  signInWithLinkedIn,
  useAuth,
  verifyEmailCode,
} from "@/lib/auth";

import { router } from "expo-router";

import { Brand } from '@/components/Brand';
import { SignInIcon } from '@/components/SignInIcon';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SignInKind = "linkedin" | "github" | "google" | "email" | "code";

export default function SignInScreen() {
  const { continueAsGuest } = useAuth();
  const tint = useThemeColor({}, "tint");
  const text = useThemeColor({}, "text");
  const muted = useThemeColor({}, "muted");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<SignInKind | null>(null);
  const [message, setMessage] = useState<{
    kind: "error" | "info";
    text: string;
  } | null>(null);
  // Only show OAuth buttons for providers enabled in Supabase Auth.
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  useEffect(() => {
    enabledProviders().then(setProviders);
  }, []);

  const run = async (
    kind: SignInKind,
    fn: () => Promise<void>,
    success?: string,
  ) => {
    setBusy(kind);
    setMessage(null);
    try {
      await fn();
      if (kind === "email") setShowCode(true);
      if (success) setMessage({ kind: "info", text: success });
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const validCode = /^\d{6,10}$/.test(code.trim());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Brand />
          <View style={styles.sky} accessible={false} pointerEvents="none">
            <Svg width="100%" height={88} viewBox="0 0 360 88">
              <Path d="M 44 57 L 119 29 L 195 55 L 271 20 L 322 43" stroke="#7F98C1" strokeWidth={0.8} opacity={0.5} fill="none" />
              {[ [44,57], [119,29], [195,55], [271,20], [322,43] ].map(([x,y], i) => (
                <Circle key={`halo${i}`} cx={x} cy={y} r={i === 2 ? 12 : 7} fill="#526EA5" opacity={0.09} />
              ))}
              {[ [44,57], [119,29], [195,55], [271,20], [322,43], [80,18], [238,69], [301,72], [157,12] ].map(([x,y], i) => (
                <Circle key={i} cx={x} cy={y} r={i === 2 ? 2.7 : i < 5 ? 1.8 : 0.7} fill="#47628D" opacity={i < 5 ? 1 : 0.45} />
              ))}
            </Svg>
          </View>
          <Text style={styles.title}>
            Less networking.{"\n"}More connection.
          </Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Find your people at HackGT 13. Start with something you share.
          </Text>
          <View style={styles.form}>
          <Text style={styles.formTitle}>Welcome to Constellation</Text>
          <Text style={[styles.formSubtitle, { color: muted }]}>Sign in or create your account.</Text>

          {providers.linkedin_oidc && (
            <Pressable
              style={[styles.button, { backgroundColor: tint }]}
              onPress={() => run("linkedin", signInWithLinkedIn)}
              disabled={busy !== null}
              accessibilityRole="button"
            >
              {busy === "linkedin" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <><SignInIcon provider="linkedin" /><Text style={styles.buttonTextLight}>
                  Continue with LinkedIn
                </Text></>
              )}
            </Pressable>
          )}

          {providers.github && (
            <Pressable
              style={[styles.button, styles.outline, { borderColor: tint }]}
              onPress={() => run("github", signInWithGitHub)}
              disabled={busy !== null}
              accessibilityRole="button"
            >
              {busy === "github" ? (
                <ActivityIndicator />
              ) : (
                <><SignInIcon provider="github" color={tint} /><Text style={[styles.buttonText, { color: tint }]}>
                  Continue with GitHub
                </Text></>
              )}
            </Pressable>
          )}

          {providers.google && (
            <Pressable
              style={[styles.button, styles.outline, { borderColor: tint }]}
              onPress={() => run("google", signInWithGoogle)}
              disabled={busy !== null}
              accessibilityRole="button"
            >
              {busy === "google" ? (
                <ActivityIndicator />
              ) : (
                <><SignInIcon provider="google" /><Text style={[styles.buttonText, { color: tint }]}>
                  Continue with Google
                </Text></>
              )}
            </Pressable>
          )}

          {(providers.linkedin_oidc || providers.github || providers.google) && <Text style={[styles.or, { color: muted }]}>or continue with email</Text>}
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={[styles.input, { color: text, borderColor: "#DDE2EA" }]}
            placeholder="you@gatech.edu"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Email address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={[
              styles.button,
              { backgroundColor: tint, opacity: validEmail ? 1 : 0.5 },
            ]}
            onPress={() =>
              run(
                "email",
                () => sendMagicLink(email),
                "Check your email. Open the link on this phone, or type the code below.",
              )
            }
            disabled={!validEmail || busy !== null}
            accessibilityRole="button"
          >
            {busy === "email" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <><SignInIcon provider="email" /><Text style={styles.buttonTextLight}>
                {showCode ? 'Send a new sign-in link' : 'Continue with email'}
              </Text></>
            )}
          </Pressable>
          <Text style={[styles.emailHint, { color: muted }]}>No password to remember. We’ll email you a secure link.</Text>
          {!showCode && <Pressable onPress={() => setShowCode(true)} accessibilityRole="button" style={styles.codeToggle}>
            <Text style={{ color: tint, fontSize: 13, fontWeight: '600' }}>Already have a sign-in code?</Text>
          </Pressable>}
          {showCode && <>
          <Text style={styles.label}>Code from your email</Text>
          <TextInput
            style={[styles.input, { color: text, borderColor: "#DDE2EA", letterSpacing: 3 }]}
            placeholder="6–10 digit code"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            accessibilityLabel="Email sign-in code"
            value={code}
            onChangeText={setCode}
          />
          <Pressable
            style={[
              styles.button,
              styles.outline,
              { borderColor: tint, opacity: validEmail && validCode ? 1 : 0.5 },
            ]}
            onPress={() => run("code", () => verifyEmailCode(email, code))}
            disabled={!validEmail || !validCode || busy !== null}
            accessibilityRole="button"
          >
            {busy === "code" ? (
              <ActivityIndicator />
            ) : (
              <><SignInIcon provider="code" color={tint} /><Text style={[styles.buttonText, { color: tint }]}>
                Sign in with code
              </Text></>
            )}
          </Pressable>
          </>}

          {message && (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, message.kind === "error" && styles.error]}
            >
              {message.text}
            </Text>
          )}
          </View>

          <Pressable
            onPress={() => router.push("/company-sign-in")}
            style={styles.guest}
            accessibilityRole="button"
          >
            <Text style={[styles.guestText, { opacity: 0.85 }]}>
              Company? Separate login
            </Text>
          </Pressable>

          <Pressable
            onPress={continueAsGuest}
            style={styles.guest}
            accessibilityRole="button"
          >
            <Text style={styles.guestText}>
              Try the demo (no account needed)
            </Text>
          </Pressable>

          <InstallHint />

          <Text style={styles.disclosure}>
            We build your interest profile from what you share (resume, GitHub,
            what you type). To verify in-person conversations, the app privately
            records Bluetooth proximity to other attendees; raw readings are
            deleted after 24 hours and nobody else sees them.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", backgroundColor: '#F8F7F5' },
  container: {
    justifyContent: "center",
    padding: 22,
    paddingVertical: 12,
    gap: 16,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "500",
    letterSpacing: -1.5,
  },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  sky: { backgroundColor: 'transparent', marginTop: 0, marginBottom: -12 },
  form: { backgroundColor: 'transparent', borderTopWidth: 1, borderColor: '#E5E7ED', paddingTop: 24, marginTop: 8, gap: 12 },
  formTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4 },
  formSubtitle: { fontSize: 13, lineHeight: 19, marginTop: -6, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  emailHint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  codeToggle: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  button: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 15, fontWeight: "600" },
  buttonTextLight: { fontSize: 15, fontWeight: "600", color: "#fff" },
  or: { textAlign: "center", marginTop: 8, fontSize: 13 },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FAFBFD',
  },
  message: { textAlign: "center", fontSize: 15 },
  error: { color: "#d33" },
  guest: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  guestText: { fontSize: 15, opacity: 0.6, textDecorationLine: "underline" },
  disclosure: { fontSize: 12, lineHeight: 18, opacity: 0.75, marginTop: 12 },
});
