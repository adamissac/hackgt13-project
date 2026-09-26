import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './api';
import { env } from './env';
import { setDemo } from './mode';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Matches the server's own connect flow: public repos only, never `repo`. */
const GITHUB_SCOPES = 'read:user';

// formalconnect://auth/callback in dev builds; must be in Supabase Auth redirect URLs.
export const redirectTo = Linking.createURL('auth/callback');

// One exchange per code. The same code can arrive twice at once (the in-app browser result AND the
// deep link Expo Router receives); a second exchange would fail and look like a failed sign-in.
const exchanges = new Map<string, Promise<Session | null>>();

function exchangeOnce(code: string): Promise<Session | null> {
  let p = exchanges.get(code);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // Already exchanged by the other path? Then we're signed in and this isn't a failure.
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) return existing.session;
        console.warn('[auth] code exchange failed:', error.message);
        throw error;
      }
      return data.session;
    })();
    exchanges.set(code, p);
  }
  return p;
}

/** Pull `code` (PKCE) or an error out of a redirect URL and turn it into a session. */
export async function completeAuthFromUrl(url: string): Promise<Session | null> {
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
    if (data.session) return data.session; // nothing to do: already signed in
    throw new Error('Sign-in link is missing its code. Try again.');
  }
  return exchangeOnce(code);
}

/** Shared OAuth handshake: open the provider in an in-app auth session, then trade the code. */
async function signInWithProvider(
  provider: 'linkedin_oidc' | 'github' | 'google' | 'x' | 'twitter',
  options?: { scopes?: string },
): Promise<Session | null> {
  console.log(`[auth] ${provider} sign-in, return URL`, redirectTo);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true, ...options },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  console.log(`[auth] ${provider} browser result:`, result.type);
  if (result.type === 'success') return completeAuthFromUrl(result.url);
  // "dismiss"/"cancel": if the provider handed off to its own app (LinkedIn does), the code comes back as a deep link to
  // /auth/callback instead. Give it a moment before treating this as a cancel.
  for (let i = 0; i < 10; i++) {
    const { data: s } = await supabase.auth.getSession();
    // Note: a session recovered here came from storage, so it carries no provider_token.
    // GitHub's token reuse is best effort and simply doesn't happen down this path.
    if (s.session) return s.session;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null; // genuinely cancelled
}

/** LinkedIn OIDC through Supabase, in an in-app auth session. */
export async function signInWithLinkedIn(): Promise<void> {
  await signInWithProvider('linkedin_oidc');
}

/** Current Supabase exposes X as `x` (OAuth 2.0). Older projects — including ours right now —
 *  only list the legacy `twitter` (OAuth 1.0a) provider; `/auth/v1/settings` has no `x` key at all.
 *  Resolve against what this project actually reports so the button is not permanently dead. */
export type XSlug = 'x' | 'twitter';

export function xProviderSlug(providers: Record<string, boolean>): XSlug | null {
  if (providers.x) return 'x';
  if (providers.twitter) return 'twitter';
  return null;
}

/** X OAuth. Pass the slug from `xProviderSlug()`; defaults to the modern one. */
export async function signInWithX(slug: XSlug = 'x'): Promise<void> {
  await signInWithProvider(slug);
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithProvider('google');
}

/** Add a login identity to the current user, without creating a second app account. */
export async function connectLoginProvider(provider: 'google' | 'x'): Promise<boolean> {
  const { data: before, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!before.user) throw new Error('Sign in before connecting an account.');
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not open the account connection. Try again.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') await completeAuthFromUrl(result.url);

  // A pre-existing session is not proof of linking: read the verified identities from Auth.
  const { data: after, error: refreshError } = await supabase.auth.getUser();
  if (refreshError) throw refreshError;
  if (after.user?.id !== before.user.id) throw new Error('Account changed. Please reopen your profile.');
  const linked = after.user.identities?.some((identity) => identity.provider === provider) ?? false;
  if (!linked && result.type === 'success') throw new Error('The account was not connected. Please try again.');
  return linked;
}

/** GitHub through Supabase Auth.
 *
 *  Supabase returns the GitHub access token as `session.provider_token` exactly once, right after
 *  sign-in — it is not persisted. We hand it straight to the server, which validates it and stores
 *  it encrypted in `linked_accounts`, so the user is never asked to authorize GitHub a second time
 *  for repo ingestion. Best effort: if that call fails the user is still signed in and can use the
 *  normal Connect GitHub button, so we never fail sign-in over it. */
export async function signInWithGitHub(): Promise<void> {
  const session = await signInWithProvider('github', { scopes: GITHUB_SCOPES });
  const providerToken = session?.provider_token;
  if (!providerToken) return;
  try {
    await api.githubFromSession(providerToken, GITHUB_SCOPES);
  } catch (e) {
    console.warn('[auth] could not reuse the GitHub sign-in token; Connect GitHub still works', e);
  }
}

/** Which OAuth providers Supabase Auth has switched on (so the sign-in screen never shows a dead button). */
export async function enabledProviders(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } });
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return json.external ?? {};
  } catch {
    return { linkedin_oidc: true }; // offline: show the main button; the error explains itself
  }
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

  // A real sign-in always means live data: drop a remembered "Try the demo" choice, otherwise a
  // LinkedIn user keeps seeing the demo cast instead of the event's attendees.
  useEffect(() => {
    if (!session) return;
    setGuest(false);
    setDemo(false);
    AsyncStorage.removeItem(DEMO_KEY).catch(() => undefined);
  }, [session]);

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
