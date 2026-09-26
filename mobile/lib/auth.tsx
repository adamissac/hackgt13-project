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

/** Pull `code` (PKCE) or an error out of a redirect URL and turn it into a session. */
export async function completeAuthFromUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  const hashParams = new URLSearchParams(url.split('#')[1] ?? '');
  const error = (queryParams?.error_description as string) ?? hashParams.get('error_description');
  if (error) throw new Error(error);
  const code = queryParams?.code as string | undefined;
  if (!code) throw new Error('Sign-in link is missing its code. Request a new one.');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/** Shared OAuth handshake: open the provider in an in-app auth session, then trade the code. */
async function signInWithProvider(provider: 'linkedin_oidc' | 'github'): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user cancelled
  await completeAuthFromUrl(result.url);
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
