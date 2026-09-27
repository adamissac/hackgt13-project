import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, SectionTitle, useColors } from './ui';
import { connectLoginProvider, enabledProviders, useAuth, xProviderSlug, type LinkableProvider } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

export function LoginConnections() {
  const c = useColors();
  const { guest } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const { state, reload } = useAsync(async () => {
    if (guest) return { providers: [] as { id: LinkableProvider; label: string }[], linked: [] as string[] };
    const [enabled, { data, error }] = await Promise.all([
      enabledProviders(), supabase.auth.getUserIdentities(),
    ]);
    if (error) throw error;
    // X is `x` on current Supabase and legacy `twitter` on older projects (ours). Resolve against
    // what this project actually reports, or the button reads "not available yet" forever.
    const xSlug = xProviderSlug(enabled);
    const providers: { id: LinkableProvider; label: string }[] = [];
    if (xSlug) providers.push({ id: xSlug, label: 'X' });
    return { providers, linked: data.identities.map((identity) => identity.provider) };
  }, [guest]);

  const connect = async (provider: LinkableProvider, label: string) => {
    setBusy(provider);
    setMessage('');
    try {
      const linked = await connectLoginProvider(provider);
      setMessage(linked ? `${label} connected to this account.` : 'Connection cancelled.');
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect. Try again.');
    } finally {
      setBusy(null);
    }
  };

  // Nothing to connect (X not switched on): show nothing rather than an empty card.
  if (guest || (state.status === 'ready' && state.data.providers.length === 0)) return null;
  return (
    <Card>
      <SectionTitle>Sign-in accounts</SectionTitle>
      <Text style={{ color: c.muted }}>Connect another way to sign in to this same profile. X is used for identity only; we do not import mail, contacts, or posts.</Text>
      {state.status === 'loading' && <Text style={{ color: c.muted }}>Loading accounts…</Text>}
      {state.status === 'error' && <>
        <Text style={{ color: c.danger }}>{state.message}</Text>
        <Button label="Retry" onPress={reload} />
      </>}
      {state.status === 'ready' && state.data.providers.map(({ id, label }) => {
        const linked = state.data.linked.includes(id);
        return <Button key={id}
          label={linked ? `${label} connected` : `Connect ${label}`}
          onPress={() => connect(id, label)} variant="secondary"
          disabled={linked || busy !== null} loading={busy === id} />;
      })}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{message}</Text> : null}
    </Card>
  );
}
