import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';

// AK4 recipient screen, opened by formalconnect://invite/<token> (or the dashboard https link
// that redirects there). Accept connects the two people; "Not now" stores nothing, so the sender
// never learns about a no.
export default function InviteAcceptScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, guest } = useAuth();
  const signedIn = Boolean(session) || guest;

  return (
    <>
      <Stack.Screen options={{ title: 'Invite' }} />
      {!signedIn ? (
        <View style={styles.center}>
          <Text style={styles.title}>Sign in to see this invite</Text>
          <Text style={styles.muted}>Then open the invite link again.</Text>
          <GoHome label="Sign in" />
        </View>
      ) : (
        <InviteBody token={String(token ?? '')} />
      )}
    </>
  );
}

function InviteBody({ token }: { token: string }) {
  const tint = useThemeColor({}, 'tint');
  const { state, reload } = useAsync(() => api.resolveInvite(token), [token]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'connected'; name: string | null } | { kind: 'dismissed' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (response: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.respondInvite(token, response);
      setResult(r.status === 'connected' ? { kind: 'connected', name: r.connection.name } : { kind: 'dismissed' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <Loading label="Opening invite…" />;
  if (state.status === 'error') {
    // Expired, revoked, used, unknown, or blocked all read the same to the recipient.
    const gone = state.message === 'expired' || state.message === 'not_found';
    return gone ? (
      <View style={styles.center}>
        <Text style={styles.title}>This invite isn&apos;t available</Text>
        <Text style={styles.muted}>It may have expired or already been used. Ask them for a new link.</Text>
        <GoHome />
      </View>
    ) : (
      <ErrorState message={state.message} onRetry={reload} />
    );
  }

  const inv = state.data;
  const name = inv.sender.name ?? 'Someone';

  if (result?.kind === 'connected') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>You&apos;re connected with {result.name ?? name}</Text>
        <GoHome />
      </View>
    );
  }
  if (result?.kind === 'dismissed') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Okay, nothing was sent</Text>
        <Text style={styles.muted}>{name} won&apos;t be told.</Text>
        <GoHome />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.sender}>
        {inv.sender.photo_url ? (
          <Image source={{ uri: inv.sender.photo_url }} style={styles.photo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.photo, styles.initials]}>
            <Text style={styles.initialsText}>{name.slice(0, 1)}</Text>
          </View>
        )}
        <Text style={styles.title}>{name}</Text>
        {inv.sender.headline ? <Text style={styles.muted}>{inv.sender.headline}</Text> : null}
        {inv.note ? <Text style={styles.note}>“{inv.note}”</Text> : null}
      </View>

      {inv.is_own ? (
        <Text style={styles.muted}>This is your own invite. Share it with someone you know.</Text>
      ) : inv.already_connected ? (
        <>
          <Text style={styles.muted}>You&apos;re already connected.</Text>
          <GoHome />
        </>
      ) : (
        <>
          <Text style={styles.question}>Have you talked with {name}, and do you want to connect?</Text>
          {error ? <Text style={styles.error}>{error === 'expired' ? 'This invite just expired.' : error}</Text> : null}
          <Pressable
            onPress={() => respond('accept')}
            disabled={busy}
            style={[styles.primary, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Yes, connect</Text>
          </Pressable>
          <Pressable onPress={() => respond('decline')} disabled={busy} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function GoHome({ label = 'Done' }: { label?: string }) {
  const tint = useThemeColor({}, 'tint');
  return (
    <Pressable
      onPress={() => router.replace('/')}
      style={[styles.primary, styles.done, { backgroundColor: tint }]}
      accessibilityRole="button">
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  sender: { alignItems: 'center', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 48 },
  initials: { backgroundColor: '#8883', alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 36, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  muted: { fontSize: 15, opacity: 0.65, textAlign: 'center' },
  note: { fontSize: 16, fontStyle: 'italic', textAlign: 'center' },
  question: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  error: { fontSize: 15, color: '#d33', textAlign: 'center' },
  primary: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  done: { alignSelf: 'stretch', marginTop: 8 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', opacity: 0.7 },
});
