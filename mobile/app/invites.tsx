import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Empty, ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { api, type CreateInviteResponse, type MyInvite } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// AK4: private invites for people you already know (MASTER_SPEC 3.7). Makes a single-use link and
// QR, shares it, and lists your own invites so you can revoke them. Nobody can search for you;
// only someone holding this link can connect.
export default function InvitesScreen() {
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const { state, reload } = useAsync(() => api.myInvites(), []);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const inv = await api.createInvite({ channel: 'link', note: note.trim() || undefined });
      setCreated(inv);
      setNote('');
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg === 'rate_limited' ? 'You can send 10 invites a day. Try again tomorrow.' : msg);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (inv: MyInvite) => {
    try {
      await api.revokeInvite(inv.invite_id);
      if (created?.invite_id === inv.invite_id) setCreated(null);
      reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Invite someone you know</Text>
      <Text style={styles.muted}>
        For people you have already talked to. The link works once, expires in 7 days, and you can revoke it. If they
        don&apos;t accept, you won&apos;t be told.
      </Text>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add a note (optional), e.g. Great chatting at the ML meetup"
        placeholderTextColor="#8889"
        maxLength={280}
        style={[styles.input, { color: textColor }]}
        accessibilityLabel="Note for the person you are inviting"
      />
      <Pressable
        onPress={create}
        disabled={creating}
        style={[styles.primary, { backgroundColor: tint, opacity: creating ? 0.6 : 1 }]}
        accessibilityRole="button">
        <Text style={styles.primaryText}>{creating ? 'Creating…' : 'Create invite link'}</Text>
      </Pressable>
      {createError ? <Text style={styles.error}>{createError}</Text> : null}

      {created ? (
        <View style={styles.card}>
          <View style={styles.qr}>
            <QRCode value={created.qr_payload} size={220} />
          </View>
          <Text style={styles.muted} selectable>
            {created.url}
          </Text>
          <Pressable
            onPress={() => Share.share({ message: `Let's connect on Formal Connection: ${created.url}` })}
            style={[styles.secondary, { borderColor: tint }]}
            accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: tint }]}>Share link</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>Your invites</Text>
      {state.status === 'loading' && <Loading label="Loading your invites…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.data.invites.length === 0 ? (
          <Empty title="No invites yet" />
        ) : (
          state.data.invites.map((inv) => (
            <View key={inv.invite_id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{inv.recipient_hint || inv.note || `Invite #${inv.invite_id}`}</Text>
                <Text style={styles.muted}>
                  {inv.status === 'active' ? `Active until ${new Date(inv.expires_at).toLocaleDateString()}` : inv.status}
                </Text>
              </View>
              {inv.status === 'active' ? (
                <Pressable onPress={() => revoke(inv)} style={styles.revoke} accessibilityRole="button">
                  <Text style={styles.revokeText}>Revoke</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  muted: { fontSize: 14, opacity: 0.65 },
  error: { fontSize: 15, color: '#d33' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#8886', borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  primary: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondary: { minHeight: 48, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#8884', borderRadius: 16, padding: 16, gap: 12, alignItems: 'center' },
  qr: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 14, gap: 8 },
  rowText: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  revoke: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  revokeText: { fontSize: 15, color: '#d33', fontWeight: '600' },
});
