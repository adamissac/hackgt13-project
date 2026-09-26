import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiBadge, Button, Card, useColors } from '@/components/ui';
import { connectGithub, uploadResume, waitForJob } from '@/lib/accounts';
import { api } from '@/lib/api';
import { emitChange } from '@/lib/changes';

type Step = 'idle' | 'working' | 'done' | 'error';

// Post-signup onboarding (shown once, for every sign-in method). GitHub and a resume feed the
// server's profile builder (extraction → canonical skills with weight + source). Both are optional;
// skipping marks onboarding 'partial' and Home keeps a reminder until a profile has been built.
export default function OnboardingScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [github, setGithub] = useState<Step>('idle');
  const [resume, setResume] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // The builder runs in the background on the server; wait for the first stored interests.
  const waitForProfile = async () => {
    setBuilding(true);
    const until = Date.now() + 90_000;
    while (alive.current && Date.now() < until) {
      if ((await api.onboardingStatus().catch(() => 'pending')) === 'complete') {
        if (alive.current) setReady(true);
        break;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (alive.current) setBuilding(false);
  };

  // GitHub only shares public repos. If there are none, say so instead of waiting on nothing.
  const checkGithubRepos = async () => {
    for (let i = 0; i < 12 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const acct = await api.accounts().catch(() => null);
      const n = acct?.sources.github.repo_count;
      if (n === 0) {
        console.log('[github] connected, no public repos');
        setNote(`GitHub connected${acct?.sources.github.login ? ` as ${acct.sources.github.login}` : ''}, but it has no public repos to learn from. Add your resume below.`);
        return;
      }
      if (typeof n === 'number') {
        console.log('[github] imported', n, 'public repos');
        return;
      }
    }
  };

  const onGithub = async () => {
    setGithub('working');
    setError(null);
    try {
      const r = await connectGithub();
      if (r === 'cancelled') return setGithub('idle');
      if (typeof r === 'object') throw new Error(r.error);
      setGithub('done');
      void checkGithubRepos();
      void waitForProfile();
    } catch (e) {
      console.warn('[github] connect failed:', e instanceof Error ? e.message : e);
      setGithub('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onResume = async () => {
    setResume('working');
    setError(null);
    try {
      const job = await uploadResume();
      if (!job) return setResume('idle');
      setResume('done');
      setBuilding(true);
      await waitForJob(job);
      void waitForProfile();
    } catch (e) {
      console.warn('[resume] failed:', e instanceof Error ? e.message : e);
      setResume('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const finish = async () => {
    setLeaving(true);
    try {
      if (!ready) await api.finishOnboarding();
    } catch {
      // not fatal: Home will just ask again
    }
    emitChange('profile'); // the root layout sees the new status and opens the app
  };

  const anyDone = github === 'done' || resume === 'done';

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={{ gap: 8 }}>
        <AiBadge label="Step 1 of 1" />
        <Text style={[styles.title, { color: c.text }]}>Let’s build your profile</Text>
        <Text style={[styles.body, { color: c.muted }]}>
          We read your GitHub and resume to figure out what you know and care about, then use that to find people worth
          meeting. You can review everything afterwards.
        </Text>
      </View>

      <SourceCard
        icon="⌥"
        title="Connect your GitHub"
        detail="Read-only: public repos, languages, READMEs, and activity. We never post anything."
        step={github}
        doneLabel="GitHub connected"
        action="Connect GitHub"
        onPress={onGithub}
      />
      <SourceCard
        icon="📄"
        title="Upload your resume"
        detail="PDF or Word, up to 10 MB. Stored privately; only you and our matching service can read it."
        step={resume}
        doneLabel="Resume uploaded"
        action="Upload resume"
        onPress={onResume}
      />

      {note && <Text style={[styles.body, { color: c.text }]}>{note}</Text>}
      {error && <Text style={[styles.small, { color: c.danger }]}>{error}</Text>}

      {(building || ready) && (
        <Card highlight>
          {ready ? (
            <>
              <Text style={[styles.cardTitle, { color: c.success }]}>✓ Your profile is ready</Text>
              <Text style={[styles.body, { color: c.muted }]}>Your skills and interests are on the Profile tab.</Text>
            </>
          ) : (
            <View style={styles.row}>
              <ActivityIndicator color={c.ai} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: c.text }]}>Building your profile…</Text>
                <Text style={[styles.small, { color: c.muted }]}>Usually under a minute. You can keep going; it finishes in the background.</Text>
              </View>
            </View>
          )}
        </Card>
      )}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button label={anyDone ? 'Continue' : 'Skip for now'} variant={anyDone ? 'primary' : 'secondary'} onPress={finish} loading={leaving} />
        {!anyDone && (
          <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>
            You can add these later from Profile → Edit profile. Matches are better with at least one.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function SourceCard(props: {
  icon: string;
  title: string;
  detail: string;
  step: Step;
  doneLabel: string;
  action: string;
  onPress: () => void;
}) {
  const c = useColors();
  const done = props.step === 'done';
  return (
    <Card highlight={done}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: done ? c.successSoft : c.tintSoft }]}>
          <Text style={{ fontSize: 22, color: done ? c.success : c.tint }}>{done ? '✓' : props.icon}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{done ? props.doneLabel : props.title}</Text>
          <Text style={[styles.small, { color: c.muted }]}>{props.detail}</Text>
        </View>
      </View>
      {!done && (
        <Button
          label={props.step === 'error' ? 'Try again' : props.action}
          onPress={props.onPress}
          loading={props.step === 'working'}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
