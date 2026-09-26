import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, SectionTitle, useColors } from './ui';
import { connectLoginProvider, enabledProviders, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

const providers = [{ id: 'google', label: 'Google' }, { id: 'x', label: 'X' }] as const;

export function LoginConnections() {
  const c = useColors();
  const { guest } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const { state, reload } = useAsync(async () => {
    if (guest) return { enabled: {} as Record<string, boolean>, linked: [] as string[] };
    const [enabled, { data, error }] = await Promise.all([
      enabledProviders(), supabase.auth.getUserIdentities(),
    ]);
    if (error) throw error;
    return { enabled, linked: data.identities.map((identity) => identity.provider) };
  }, [guest]);

  const connect = async (provider: 'google' | 'x', label: string) => {
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

  if (guest) return null;
  return (
    <Card>
      <SectionTitle>Sign-in accounts</SectionTitle>
      <Text style={{ color: c.muted }}>Connect another way to sign in to this same profile. Google and X are used for identity only; we do not import mail, contacts, or posts.</Text>
      {state.status === 'loading' && <Text style={{ color: c.muted }}>Loading accounts…</Text>}
      {state.status === 'error' && <>
        <Text style={{ color: c.danger }}>{state.message}</Text>
        <Button label="Retry" onPress={reload} />
      </>}
      {state.status === 'ready' && providers.map(({ id, label }) => {
        const linked = state.data.linked.includes(id);
        return <Button key={id}
          label={linked ? `${label} connected` : state.data.enabled[id] ? `Connect ${label}` : `${label} not available yet`}
          onPress={() => connect(id, label)} variant="secondary"
          disabled={linked || !state.data.enabled[id] || busy !== null} loading={busy === id} />;
      })}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{message}</Text> : null}
    </Card>
  );
}
