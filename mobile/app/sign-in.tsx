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

type SignInKind = "linkedin" | "github" | "google" | "email" | "code";

export default function SignInScreen() {
  const { continueAsGuest } = useAuth();
  const tint = useThemeColor({}, "tint");
  const text = useThemeColor({}, "text");
  const muted = useThemeColor({}, "muted");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Brand />
          <Text style={styles.title}>
            Less networking.{"\n"}More connection.
          </Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Find your people at HackGT 13. Start with something you share.
          </Text>
          <InstallHint />

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
                <Text style={styles.buttonTextLight}>
                  Continue with LinkedIn
                </Text>
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
                <Text style={[styles.buttonText, { color: tint }]}>
                  Continue with GitHub
                </Text>
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
                <Text style={[styles.buttonText, { color: tint }]}>
                  Continue with Google
                </Text>
              )}
            </Pressable>
          )}

          <Text style={[styles.or, { color: muted }]}>
            or continue with email
          </Text>
          <TextInput
            style={[styles.input, { color: text, borderColor: "#8886" }]}
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
            style={[
              styles.button,
              styles.outline,
              { borderColor: tint, opacity: validEmail ? 1 : 0.5 },
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
              <ActivityIndicator />
            ) : (
              <Text style={[styles.buttonText, { color: tint }]}>
                Email me a link
              </Text>
            )}
          </Pressable>
          <TextInput
            style={[styles.input, { color: text, borderColor: "#8886" }]}
            placeholder="Code from the email"
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
              <Text style={[styles.buttonText, { color: tint }]}>
                Sign in with code
              </Text>
            )}
          </Pressable>

          {message && (
            <Text
              style={[styles.message, message.kind === "error" && styles.error]}
            >
              {message.text}
            </Text>
          )}

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
  scroll: { flexGrow: 1, justifyContent: "center" },
  container: {
    justifyContent: "center",
    padding: 28,
    paddingVertical: 56,
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
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "500",
    letterSpacing: -1.5,
  },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: 20 },
  button: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  outline: { borderWidth: 1 },
  buttonText: { fontSize: 18, fontWeight: "600" },
  buttonTextLight: { fontSize: 18, fontWeight: "600", color: "#fff" },
  or: { textAlign: "center", marginTop: 8, fontSize: 13 },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
  },
  message: { textAlign: "center", fontSize: 15 },
  error: { color: "#d33" },
  guest: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  guestText: { fontSize: 15, opacity: 0.6, textDecorationLine: "underline" },
  disclosure: { fontSize: 12, lineHeight: 18, opacity: 0.75, marginTop: 12 },
});
