import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { env } from './env';
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

/** LinkedIn OIDC through Supabase, in an in-app auth session. */
export async function signInWithLinkedIn(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'linkedin_oidc',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user cancelled
  await completeAuthFromUrl(result.url);
}

/** Fallback: email magic link that returns through the same deep link. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

type AuthState = { session: Session | null; loading: boolean; guest: boolean; continueAsGuest: () => void };
const AuthContext = createContext<AuthState>({ session: null, loading: true, guest: false, continueAsGuest: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Guest mode only in mock mode, so teammates can build UI before auth is configured.
  const continueAsGuest = () => env.useMocks && setGuest(true);

  return <AuthContext.Provider value={{ session, loading, guest, continueAsGuest }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
