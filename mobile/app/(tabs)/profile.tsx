import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Button, Card, SectionTitle, useColors } from '@/components/ui';
import { api, type Facet, type Interest, type InterestsResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { env, missingEnv } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

const FACET_LABEL: Record<Facet, string> = {
  technical: 'Technical',
  career: 'Career',
  academic: 'Academic',
  personal: 'Personal',
};

// Profile: AI-extracted interests with evidence; confirm or hide each one (AD5, api.md 3-4).
export default function ProfileScreen() {
  const c = useColors();
  const { session } = useAuth();
  const { state, reload } = useAsync(() => api.getInterests(), []);
  const [override, setOverride] = useState<InterestsResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const data = override ?? (state.status === 'ready' ? state.data : null);
  const name =
    (session?.user.user_metadata?.name as string | undefined) ?? session?.user.email ?? (env.useMocks ? 'Demo user' : 'You');

  const patch = async (body: Parameters<typeof api.patchInterests>[0], optimistic: (i: Interest) => Interest) => {
    if (!data) return;
    setOverride({ ...data, interests: data.interests.map(optimistic) });
    try {
      setOverride(env.useMocks ? { ...data, interests: data.interests.map(optimistic) } : await api.patchInterests(body));
    } catch (e) {
      setOverride(data);
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, interests, connections, chats, and resume. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteMe();
              await supabase.auth.signOut();
            } catch (e) {
              Alert.alert('Couldn’t delete', e instanceof Error ? e.message : String(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  const visible = data?.interests.filter((i) => !i.hidden) ?? [];
  const byFacet = (Object.keys(FACET_LABEL) as Facet[])
    .map((f) => ({ facet: f, items: visible.filter((i) => i.facet === f) }))
    .filter((g) => g.items.length > 0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {missingEnv.length > 0 && (
        <View style={[styles.warning, { backgroundColor: c.aiSoft }]}>
          <Text style={{ color: c.text }}>Missing config: {missingEnv.join(', ')}. See mobile/.env.example.</Text>
        </View>
      )}

      <View style={styles.header}>
        <Avatar name={name} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.text }]}>{name}</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {session ? 'Signed in' : 'Not signed in'}
            {env.useMocks ? ' · demo data' : ''}
          </Text>
        </View>
      </View>

      {data && (!!data.seeking || !!data.offering) && (
        <Card>
          {!!data.seeking && (
            <Text style={[styles.body, { color: c.text }]}>
              <Text style={{ fontWeight: '700' }}>Looking for: </Text>
              {data.seeking}
            </Text>
          )}
          {!!data.offering && (
            <Text style={[styles.body, { color: c.text }]}>
              <Text style={{ fontWeight: '700' }}>Can offer: </Text>
              {data.offering}
            </Text>
          )}
        </Card>
      )}

      <SectionTitle right={<AiBadge label="Extracted by AI" />}>Your interests</SectionTitle>
      <Text style={[styles.small, { color: c.muted }]}>
        We read what you shared and pulled out these topics. Confirm the ones that fit and hide any that don’t.
      </Text>

      {state.status === 'loading' && !override && <Loading label="Loading your interests…" />}
      {state.status === 'error' && !override && <ErrorState message={state.message} onRetry={reload} />}
      {data && visible.length === 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: c.text }]}>No interests yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>Upload a resume or connect GitHub to build your profile.</Text>
        </Card>
      )}
      {byFacet.map((g) => (
        <Card key={g.facet}>
          <Text style={[styles.facet, { color: c.muted }]}>{FACET_LABEL[g.facet]}</Text>
          {g.items.map((i) => (
            <View key={i.interest_id} style={[styles.interest, { borderTopColor: c.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.interestName, { color: c.text }]}>{i.name}</Text>
                {!!i.evidence && <Text style={[styles.small, { color: c.muted }]}>{i.evidence}</Text>}
              </View>
              <Pressable
                onPress={() =>
                  !i.confirmed && patch({ confirm: [i.interest_id] }, (x) => (x.interest_id === i.interest_id ? { ...x, confirmed: true } : x))
                }
                style={[styles.iconBtn, { backgroundColor: i.confirmed ? c.successSoft : c.surfaceAlt }]}
                accessibilityLabel={i.confirmed ? `${i.name} confirmed` : `Confirm ${i.name}`}>
                <Text style={{ color: i.confirmed ? c.success : c.muted, fontSize: 18, fontWeight: '800' }}>✓</Text>
              </Pressable>
              <Pressable
                onPress={() => patch({ hide: [i.interest_id] }, (x) => (x.interest_id === i.interest_id ? { ...x, hidden: true } : x))}
                style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]}
                accessibilityLabel={`Hide ${i.name}`}>
                <Text style={{ color: c.muted, fontSize: 18, fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ))}

      {/* AK4 (Akshar): private invite link and QR for people you already know. */}
      <SectionTitle>People you already know</SectionTitle>
      <Card>
        <Button label="Invite someone you know" variant="secondary" onPress={() => router.push('/invites')} />
      </Card>

      <SectionTitle>Your network</SectionTitle>
      <Card>
        <Button label="Your network dashboard" variant="secondary" onPress={() => router.push('/web/network')} />
        <Button label="Feed insights" variant="secondary" onPress={() => router.push('/web/insights')} />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card>
        {session && <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />}
        {session && <Button label="Delete my account" variant="danger" onPress={confirmDelete} loading={deleting} />}
        {!session && <Text style={[styles.body, { color: c.muted }]}>Sign in to manage your account.</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  warning: { borderRadius: 12, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  name: { fontSize: 24, fontWeight: '800' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  facet: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  interestName: { fontSize: 17, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
