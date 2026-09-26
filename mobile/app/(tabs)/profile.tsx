import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
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
  const [reviewing, setReviewing] = useState(false);

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
      {!env.useMocks && missingEnv.length > 0 && (
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

      <SectionTitle right={data && visible.length > 0 ? (
        <Pressable onPress={() => setReviewing(!reviewing)} accessibilityRole="button" accessibilityState={{ expanded: reviewing }} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12 }}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>{reviewing ? 'Done' : 'Review'}</Text>
        </Pressable>
      ) : undefined}>Your interests</SectionTitle>
      {reviewing && <Text style={[styles.small, { color: c.muted }]}>Suggested from your sources by AI. Confirm what fits; hide what doesn’t.</Text>}

      {state.status === 'loading' && !override && <Loading label="Loading your interests…" />}
      {state.status === 'error' && !override && <ErrorState message={state.message} onRetry={reload} />}
      {data && visible.length === 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: c.text }]}>No interests yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>Upload a resume or connect GitHub to build your profile.</Text>
          <Button label="Add a source" onPress={() => router.push('/accounts')} />
        </Card>
      )}
      {!reviewing && visible.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {visible.slice(0, 8).map((i) => <Chip key={i.interest_id} label={i.name} />)}
          {visible.length > 8 && <Chip label={`+${visible.length - 8} more`} />}
        </View>
      )}
      {reviewing && byFacet.map((g) => (
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

      <SectionTitle>Make it yours</SectionTitle>
      <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
        {([
          { title: 'Your chats', detail: 'Continue a conversation', route: '/chats' },
          { title: 'Profile sources', detail: 'Resume, GitHub & a little about you', route: '/accounts' },
          { title: 'Invite someone', detail: 'Reconnect with someone you know', route: '/invites' },
          { title: 'Your network', detail: 'The connections you’ve made', route: '/network' },
          { title: 'Network activity', detail: 'What your connections are exploring', route: '/insights' },
        ] as const).map((item, index) => (
          <Pressable key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)} style={[styles.menuRow, { borderTopWidth: index ? 1 : 0, borderTopColor: c.border }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '500' }}>{item.title}</Text>
              <Text style={[styles.small, { color: c.muted }]}>{item.detail}</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 23 }}>›</Text>
          </Pressable>
        ))}
      </View>

      <Disclosure title="Account settings" subtitle="Sign-in and privacy controls">
        {session && <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />}
        {session && <Button label="Delete my account" variant="danger" onPress={confirmDelete} loading={deleting} />}
        {!session && <Text style={[styles.body, { color: c.muted }]}>Sign in to manage your account.</Text>}
      </Disclosure>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  menu: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 20 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, minHeight: 72 },
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
