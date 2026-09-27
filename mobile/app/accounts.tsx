import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppearancePicker } from '@/components/AppearancePicker';
import { ErrorState, Loading } from '@/components/States';
import { LoginConnections } from '@/components/LoginConnections';
import { ResumePreview } from '@/features/resume/ResumePreview';
import { AiBadge, Button, Card, Chip, SectionTitle, useColors } from '@/components/ui';
import { connectGithub, signInLabel, uploadResume, waitForJob } from '@/lib/accounts';
import { api, type AccountsResponse, type ProfileSource } from '@/lib/api';
import { env } from '@/lib/env';
import { useAsync } from '@/lib/useAsync';

type Busy = null | 'github' | 'github-sync' | 'resume' | 'manual' | `remove-${ProfileSource}`;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '');

// "Your sources": how you signed in and what builds your interest profile (MASTER_SPEC 2, 3.1, 5).
export default function AccountsScreen() {
  const c = useColors();
  const { state, reload } = useAsync(() => api.accounts(), []);
  const [busy, setBusy] = useState<Busy>(null);
  // Profiles are built from connected sources (GitHub, resume, linked accounts). The only typed input is one
  // optional box for anything those miss; it's stored as `interests_text` and extracted like any other source.
  const [extra, setExtra] = useState<string | null>(null);

  const data: AccountsResponse | null = state.status === 'ready' ? state.data : null;
  const savedExtra = data?.profile.interests_text ?? '';
  const extraText = extra ?? savedExtra;

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<string | void>) => {
    setBusy(kind);
    try {
      const msg = await fn();
      if (msg) Alert.alert(msg);
      reload();
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onConnectGithub = () =>
    run('github', async () => {
      const r = await connectGithub();
      if (r === 'cancelled') return;
      if (typeof r === 'object') throw new Error(r.error);
      return 'GitHub connected. We’re reading your public repos now; your interests update in a minute.';
    });

  const onSyncGithub = () =>
    run('github-sync', async () => {
      const { job_id } = await api.ingest({ source: 'github' });
      await waitForJob(job_id);
      return 'Updated from GitHub.';
    });

  const onResume = () =>
    run('resume', async () => {
      const job = await uploadResume();
      if (!job) return;
      await waitForJob(job);
      return 'Resume read. Review your interests on the Profile tab.';
    });

  const onSaveManual = () =>
    run('manual', async () => {
      const r = await api.patchManual({ interests_text: extraText.trim() });
      setExtra(null);
      if (r.job_id) await waitForJob(r.job_id);
      return 'Saved.';
    });

  const confirmRemove = (source: ProfileSource, label: string) =>
    Alert.alert(`Remove ${label}?`, 'Interests that came only from it will disappear from your profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(`remove-${source}`, async () => void (await api.removeSource(source))) },
    ]);

  if (state.status === 'loading' && !data) return <Loading label="Loading your accounts…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;
  if (!data) return null;
  const { sign_in, sources } = data;
  const gh = sources.github;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <AppearancePicker />

        <SectionTitle>Signed in</SectionTitle>
        <Card>
          <Text style={[styles.body, { color: c.text }]}>
            With {signInLabel(sign_in.provider)}
            {sign_in.email ? ` · ${sign_in.email}` : ''}
          </Text>
          {sign_in.provider === 'linkedin' && (
            <Text style={[styles.small, { color: c.muted }]}>
              LinkedIn only signs you in. We never read your LinkedIn profile; upload your LinkedIn PDF below instead.
            </Text>
          )}
        </Card>

        <LoginConnections />

        <SectionTitle right={<AiBadge label="Builds your interests" />}>Your sources</SectionTitle>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: c.text }]}>GitHub</Text>
            {gh.connected ? <Chip label="Connected" tone="success" /> : null}
          </View>
          {gh.connected ? (
            <>
              <Text style={[styles.small, { color: c.muted }]}>
                @{gh.login} · {gh.interests} interests{gh.last_synced_at ? ` · synced ${when(gh.last_synced_at)}` : ''}
              </Text>
              <Button label="Update from GitHub" variant="secondary" onPress={onSyncGithub} loading={busy === 'github-sync'} />
              <Button label="Disconnect GitHub" variant="danger" onPress={() => confirmRemove('github', 'GitHub')} loading={busy === 'remove-github'} />
            </>
          ) : gh.available ? (
            <>
              <Text style={[styles.small, { color: c.muted }]}>
                We read your public repos (languages, topics, READMEs). Read-only; your token stays on our server.
              </Text>
              <Button label="Connect GitHub" onPress={onConnectGithub} loading={busy === 'github'} />
            </>
          ) : (
            <Text style={[styles.small, { color: c.muted }]}>GitHub connect isn’t set up on the server yet.</Text>
          )}
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: c.text }]}>Resume or LinkedIn PDF</Text>
            {sources.resume.added ? <Chip label="Added" tone="success" /> : null}
          </View>
          <Text style={[styles.small, { color: c.muted }]}>
            {sources.resume.added
              ? `${sources.resume.interests} interests · added ${when(sources.resume.updated_at)}`
              : 'A PDF up to 10 MB. Tip: LinkedIn → your profile → More → Save to PDF.'}
          </Text>
          {env.useMocks && (
            <Text style={[styles.small, { color: c.muted }]}>
              Demo mode: files aren’t really uploaded. Sign in to build your real profile.
            </Text>
          )}
          {sources.resume.added && <ResumePreview version={sources.resume.updated_at} />}
          <Button label={sources.resume.added ? 'Replace PDF' : 'Upload PDF'} variant={sources.resume.added ? 'secondary' : 'primary'} onPress={onResume} loading={busy === 'resume'} />
          {sources.resume.added && (
            <Button label="Remove resume" variant="danger" onPress={() => confirmRemove('resume', 'your resume')} loading={busy === 'remove-resume'} />
          )}
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: c.text }]}>Additional information</Text>
            {sources.manual.added ? <Chip label={`${sources.manual.interests} interests`} tone="ai" /> : <Text style={[styles.small, { color: c.muted }]}>Optional</Text>}
          </View>
          <Text style={[styles.small, { color: c.muted }]}>
            Your profile is built from GitHub, your resume, and the accounts you connect. Add anything they don’t show.
          </Text>
          <TextInput
            value={extraText}
            onChangeText={setExtra}
            placeholder="Side projects, clubs, what you’re hoping to find…"
            placeholderTextColor={c.muted}
            multiline
            style={[styles.input, styles.multiline, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
            accessibilityLabel="Additional user information (optional)"
          />
          <Button label="Save" onPress={onSaveManual} loading={busy === 'manual'} disabled={extra === null || extra.trim() === savedExtra.trim()} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 48 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
});
