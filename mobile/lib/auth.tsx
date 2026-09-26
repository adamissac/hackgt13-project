import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { setDemo } from './mode';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// formalconnect://auth/callback in dev builds; must be in Supabase Auth redirect URLs.
export const redirectTo = Linking.createURL('auth/callback');

// One exchange per code. The same code can arrive twice at once (the in-app browser result AND the
// deep link Expo Router receives); a second exchange would fail and look like a failed sign-in.
const exchanges = new Map<string, Promise<void>>();

function exchangeOnce(code: string): Promise<void> {
  let p = exchanges.get(code);
  if (!p) {
    p = (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // Already exchanged by the other path? Then we're signed in and this isn't a failure.
        const { data } = await supabase.auth.getSession();
        if (data.session) return;
        console.warn('[auth] code exchange failed:', error.message);
        throw error;
      }
    })();
    exchanges.set(code, p);
  }
  return p;
}

/** Pull `code` (PKCE) or an error out of a redirect URL and turn it into a session. */
export async function completeAuthFromUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const hashParams = new URLSearchParams(url.split('#')[1] ?? '');
  const error = (queryParams?.error_description as string) ?? hashParams.get('error_description');
  if (error) {
    console.warn('[auth] provider returned an error:', error);
    throw new Error(error);
  }
  const code = queryParams?.code as string | undefined;
  if (!code) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return; // nothing to do: already signed in
    throw new Error('Sign-in link is missing its code. Try again.');
  }
  await exchangeOnce(code);
}

/** Shared OAuth handshake: open the provider in an in-app auth session, then trade the code. */
async function signInWithProvider(provider: 'linkedin_oidc' | 'github'): Promise<void> {
  console.log(`[auth] ${provider} sign-in, return URL`, redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  console.log(`[auth] ${provider} browser result:`, result.type);
  if (result.type === 'success') return completeAuthFromUrl(result.url);
  // "dismiss"/"cancel": if the provider handed off to its own app (LinkedIn does), the code comes back as a deep link to
  // /auth/callback instead. Give it a moment before treating this as a cancel.
  for (let i = 0; i < 10; i++) {
    const { data: s } = await supabase.auth.getSession();
    if (s.session) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** LinkedIn OIDC through Supabase, in an in-app auth session. */
export async function signInWithLinkedIn(): Promise<void> {
  return signInWithProvider('linkedin_oidc');
}

/** GitHub through Supabase Auth. Note this is identity only: it does NOT populate
 *  linked_accounts, so the user is still asked to Connect GitHub for repo ingestion. */
export async function signInWithGitHub(): Promise<void> {
  return signInWithProvider('github');
}

/** Fallback: email magic link that returns through the same deep link. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

/** Same email, typed in the app. Works when the phone's mail app will not open the link. */
export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}

type AuthState = {
  session: Session | null;
  loading: boolean;
  guest: boolean;
  continueAsGuest: () => void;
  leaveDemo: () => void;
};
const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  guest: false,
  continueAsGuest: () => {},
  leaveDemo: () => {},
});
const DEMO_KEY = 'fc.demo-guest';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.auth.getSession().then(({ data }) => setSession(data.session)),
      AsyncStorage.getItem(DEMO_KEY)
        .then((v) => {
          if (v === '1') {
            setDemo(true);
            setGuest(true);
          }
        })
        .catch(() => undefined),
    ]).finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Demo mode: no account needed; everything runs against lib/demo. Remembered across reloads.
  const continueAsGuest = () => {
    setDemo(true);
    setGuest(true);
    AsyncStorage.setItem(DEMO_KEY, '1').catch(() => undefined);
  };
  const leaveDemo = () => {
    setGuest(false);
    setDemo(false);
    AsyncStorage.removeItem(DEMO_KEY).catch(() => undefined);
  };

  return (
    <AuthContext.Provider value={{ session, loading, guest, continueAsGuest, leaveDemo }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
