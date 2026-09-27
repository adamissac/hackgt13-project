import { AppIcon } from '@/components/AppIcon';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { ConstellationMark } from '@/components/Brand';
import { AiBadge, Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { api, type AccountsResponse, type Facet, type Interest, type InterestsResponse, type SkillProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { demo } from '@/lib/demo';
import { env, missingEnv } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

const FACETS: { key: Facet; label: string }[] = [
  { key: 'technical', label: 'Technical' },
  { key: 'career', label: 'Career' },
  { key: 'academic', label: 'Academic' },
  { key: 'personal', label: 'Personal' },
];

const NETWORK: { title: string; detail: string; icon: string; route: Href }[] = [
  { title: 'Your connections', detail: 'Who you met and what you talked about', icon: 'people', route: '/connections' },
  { title: 'Your network', detail: 'How your network has grown', icon: 'chart', route: '/network' },
  { title: 'My connect QR & invites', detail: 'Connect with someone you already know', icon: 'qr', route: '/invites' },
  { title: 'Company events', detail: 'Create an event and a check-in QR', icon: 'event', route: '/org' },
];

// Profile: who you are to the matcher. Header → about → AI skills by area → sources → network → account.
export default function ProfileScreen() {
  const c = useColors();
  const { session, guest, leaveDemo } = useAuth();
  const interests = useAsync(() => api.getInterests(), [], ['profile']);
  const accounts = useAsync(() => api.accounts(), [], ['profile']);
  const skills = useAsync(() => api.skillProfile(), [], ['profile']);
  const [override, setOverride] = useState<InterestsResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const data = override ?? (interests.state.status === 'ready' ? interests.state.data : null);
  const acct: AccountsResponse | null = accounts.state.status === 'ready' ? accounts.state.data : null;
  const name = acct?.profile.name || (session?.user.user_metadata?.name as string | undefined) || session?.user.email || 'You';
  const headline = acct?.profile.headline || '';
  const visible = data?.interests.filter((i) => !i.hidden) ?? [];

  const patch = async (body: Parameters<typeof api.patchInterests>[0], optimistic: (i: Interest) => Interest) => {
    if (!data) return;
    setOverride({ ...data, interests: data.interests.map(optimistic) });
    try {
      setOverride(await api.patchInterests(body));
    } catch (e) {
      setOverride(data);
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete your account?', 'This permanently deletes your profile, interests, connections, chats, and resume.', [
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
    ]);

  const restartDemo = () =>
    Alert.alert('Restart the demo?', 'This clears demo chats, matches, and connections.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restart', style: 'destructive', onPress: () => demo.resetDemo() },
    ]);

  const sources = acct?.sources;
  const sourceCount = (sources?.github.added ? 1 : 0) + (sources?.resume.added ? 1 : 0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      {!env.useMocks && missingEnv.length > 0 && (
        <View style={[styles.warning, { backgroundColor: c.aiSoft }]}>
          <Text style={{ color: c.text }}>Missing config: {missingEnv.join(', ')}. See mobile/.env.example.</Text>
        </View>
      )}

      <View style={[styles.headerCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.cover, { backgroundColor: c.tint }]}>
          <View style={styles.coverMark}><ConstellationMark color="#B6C9FA" size={120} /></View>
        </View>
        <View style={[styles.avatarRing, { borderColor: c.surface, backgroundColor: c.surface }]}>
          <Avatar name={name} size={84} />
        </View>
        <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 20 }}>
          <Text style={[styles.name, { color: c.text }]}>{name}</Text>
          {!!headline && <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>{headline}</Text>}
          <View style={[styles.chips, { justifyContent: 'center' }]}>
            {guest && <Chip label="Demo" tone="ai" />}
            <Chip label={`${visible.length} skills & interests`} tone="tint" />
            <Chip label={`${sourceCount}/2 sources`} tone={sourceCount === 2 ? 'success' : 'neutral'} />
          </View>
        </View>
        <Button label="Edit profile" variant="secondary" onPress={() => router.push('/accounts')} style={{ alignSelf: 'stretch', marginHorizontal: 20 }} />
      </View>

      {data && (!!data.seeking || !!data.offering) && (
        <>
          <SectionTitle>About you</SectionTitle>
          <Card>
            {!!data.seeking && <Field label="Looking for" value={data.seeking} />}
            {!!data.offering && <Field label="Can offer" value={data.offering} divider={!!data.seeking} />}
          </Card>
        </>
      )}

      {skills.state.status === 'ready' && skills.state.data.skills.length > 0 && <SkillProfileCard p={skills.state.data} />}

      <SectionTitle
        right={
          visible.length > 0 ? (
            <Pressable onPress={() => setReviewing(!reviewing)} accessibilityRole="button" hitSlop={10} style={styles.link}>
              <Text style={{ color: c.tint, fontWeight: '700' }}>{reviewing ? 'Done' : 'Review'}</Text>
            </Pressable>
          ) : undefined
        }>
        Skills & interests
      </SectionTitle>
      {interests.state.status === 'loading' && !override && <Loading label="Loading your profile…" />}
      {interests.state.status === 'error' && !override && <ErrorState message={interests.state.message} onRetry={interests.reload} />}
      {data && visible.length === 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: c.text }]}>No skills yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>Connect GitHub or upload a resume and we’ll build this for you.</Text>
          <Button label="Add a source" onPress={() => router.push('/accounts')} />
        </Card>
      )}
      {visible.length > 0 && (
        <Card>
          <AiBadge label="Extracted by AI from your sources" />
          {FACETS.map((f) => {
            const items = visible.filter((i) => i.facet === f.key);
            if (!items.length) return null;
            return (
              <View key={f.key} style={{ gap: 8 }}>
                <Text style={[styles.facet, { color: c.muted }]}>{f.label}</Text>
                {reviewing ? (
                  items.map((i) => (
                    <View key={i.interest_id} style={[styles.reviewRow, { borderTopColor: c.border }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.interestName, { color: c.text }]}>{i.name}</Text>
                        {!!i.evidence && <Text style={[styles.small, { color: c.muted }]}>{i.evidence}</Text>}
                        <Text style={[styles.tiny, { color: c.muted }]}>from {i.source}</Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          !i.confirmed && patch({ confirm: [i.interest_id] }, (x) => (x.interest_id === i.interest_id ? { ...x, confirmed: true } : x))
                        }
                        style={[styles.iconBtn, { backgroundColor: i.confirmed ? c.successSoft : c.surfaceAlt }]}
                        accessibilityRole="button"
                        accessibilityLabel={i.confirmed ? `${i.name} confirmed` : `Confirm ${i.name}`}>
                        <Text style={{ color: i.confirmed ? c.success : c.muted, fontSize: 18, fontWeight: '800' }}>✓</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => patch({ hide: [i.interest_id] }, (x) => (x.interest_id === i.interest_id ? { ...x, hidden: true } : x))}
                        style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Hide ${i.name}`}>
                        <Text style={{ color: c.muted, fontSize: 18, fontWeight: '800' }}>✕</Text>
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <View style={styles.chips}>
                    {items.map((i) => (
                      <Chip key={i.interest_id} label={i.confirmed ? `✓ ${i.name}` : i.name} tone={i.confirmed ? 'tint' : 'neutral'} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          {reviewing && (
            <Text style={[styles.small, { color: c.muted }]}>Confirm what fits; hide what doesn’t. Hidden items stop affecting matches.</Text>
          )}
        </Card>
      )}

      <SectionTitle>Sources</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <SourceRow
          icon="code"
          title="GitHub"
          detail={sources?.github.added ? `Connected${sources.github.login ? ` as ${sources.github.login}` : ''}` : 'Not connected'}
          ok={!!sources?.github.added}
        />
        <SourceRow icon="document" title="Resume" detail={sources?.resume.added ? 'Uploaded' : 'Not uploaded'} ok={!!sources?.resume.added} divider />
      </Card>

      <SectionTitle>Your network</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {NETWORK.map((item, i) => (
          <Pressable
            key={item.title}
            onPress={() => router.push(item.route)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.menuRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { opacity: 0.6 }]}>
            <View style={[styles.menuIcon, { backgroundColor: c.surfaceAlt }]}>
              <AppIcon name={item.icon} color={c.tint} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.menuTitle, { color: c.text }]}>{item.title}</Text>
              <Text style={[styles.small, { color: c.muted }]}>{item.detail}</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 22 }}>›</Text>
          </Pressable>
        ))}
      </Card>

      <Disclosure title={guest ? 'Demo settings' : 'Account'} subtitle={guest ? 'Restart or exit the demo' : 'Sign out or delete your data'}>
        {session && <Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />}
        {session && <Button label="Delete my account" variant="danger" onPress={confirmDelete} loading={deleting} />}
        {!session && guest && (
          <>
            <Button label="Restart the demo" variant="secondary" onPress={restartDemo} />
            <Button label="Exit demo and sign in" onPress={leaveDemo} />
          </>
        )}
      </Disclosure>
    </ScrollView>
  );
}

const SOURCE_LABEL = { github: 'GitHub', resume: 'Resume', manual: 'You' } as const;

function SkillProfileCard({ p }: { p: SkillProfile }) {
  const c = useColors();
  return (
    <>
      <SectionTitle right={<AiBadge label={`v${p.profile_version}`} />}>Skill profile</SectionTitle>
      <Card>
        <View style={styles.chips}>
          {p.domains.map((d) => (
            <Chip key={d} label={d} tone="ai" />
          ))}
          {p.experience_years_estimate != null && <Chip label={`~${p.experience_years_estimate} yrs experience`} tone="tint" />}
        </View>
        {p.skills.slice(0, 8).map((s, i) => (
          <View key={s.name} style={[styles.skillRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <Text style={[styles.interestName, { color: c.text, flex: 1 }]}>{s.name}</Text>
            <Text style={[styles.tiny, { color: c.muted }]}>{s.sources.map((x) => SOURCE_LABEL[x] ?? x).join(' + ')}</Text>
            <View style={[styles.meter, { backgroundColor: c.surfaceAlt }]}>
              <View style={{ width: `${Math.round(s.confidence * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.tint }} />
            </View>
          </View>
        ))}
        {p.project_highlights.length > 0 && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={[styles.facet, { color: c.muted }]}>Project highlights</Text>
            {p.project_highlights.slice(0, 3).map((h) => (
              <View key={h.name} style={[styles.project, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.interestName, { color: c.text }]}>
                  {h.pinned ? 'Pinned · ' : ''}
                  {h.name}
                </Text>
                {!!h.description && <Text style={[styles.small, { color: c.muted }]}>{h.description}</Text>}
                <Text style={[styles.tiny, { color: c.muted }]}>
                  {[...h.languages, ...h.frameworks].slice(0, 4).join(' · ')}
                  {h.stars ? `  ★ ${h.stars}` : ''}
                  {h.commits_last_year ? `  · ${h.commits_last_year} commits this year` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

function Field({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  const c = useColors();
  return (
    <View style={[{ gap: 2 }, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 10 }]}>
      <Text style={[styles.tiny, { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 }]}>{label}</Text>
      <Text style={[styles.body, { color: c.text }]}>{value}</Text>
    </View>
  );
}

function SourceRow({ icon, title, detail, ok, divider }: { icon: string; title: string; detail: string; ok: boolean; divider?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push('/accounts')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.menuRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { opacity: 0.6 }]}>
      <View style={[styles.menuIcon, { backgroundColor: ok ? c.successSoft : c.surfaceAlt }]}>
        <AppIcon name={ok ? 'check' : icon} color={ok ? c.success : c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.menuTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.small, { color: c.muted }]}>{detail}</Text>
      </View>
      <Text style={{ color: ok ? c.muted : c.tint, fontWeight: '700' }}>{ok ? 'Manage' : 'Add'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, paddingBottom: 100, width: '100%', maxWidth: 640, alignSelf: 'center' },
  warning: { borderRadius: 12, padding: 12 },
  headerCard: { alignItems: 'center', gap: 12, paddingBottom: 20, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  cover: { alignSelf: 'stretch', height: 104, overflow: 'hidden' },
  coverMark: { position: 'absolute', right: -14, top: -14, opacity: 0.35 },
  avatarRing: { marginTop: -52, borderWidth: 4, borderRadius: 50 },
  name: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  facet: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  link: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  interestName: { fontSize: 16, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 16, fontWeight: '600' },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  meter: { width: 56, height: 6, borderRadius: 3, overflow: 'hidden' },
  project: { borderRadius: 12, padding: 12, gap: 3 },
});
