import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Button, Card, Chip, MatchMeter, SectionTitle, useColors } from '@/components/ui';
import { api, type Match, type Suggestion } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { MeetupBanner } from '@/features/location/MeetupBanner';

// Open to Meet (MASTER_SPEC 3.3). Goes through PATCH /me/open-to-meet so turning it off
// also ends any live meetup location sharing on the server.
function useOpenToMeet() {
  const { session } = useAuth();
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('open_to_meet')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => data && setOn(Boolean(data.open_to_meet)));
  }, [session]);

  const toggle = async (next: boolean) => {
    setOn(next);
    setError(null);
    try {
      const res = await api.setOpenToMeet(next);
      setOn(res.open_to_meet);
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return { on, toggle, error };
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const openToMeet = useOpenToMeet();
  const matches = useAsync(() => api.matches(HACKGT_EVENT_ID), []);
  const suggestions = useAsync(() => api.suggestions(), []);

  const refresh = () => {
    matches.reload();
    suggestions.reload();
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <View>
        <Text style={[styles.eyebrow, { color: c.muted }]}>HackGT 13 · Georgia Tech</Text>
        <Text style={[styles.hero, { color: c.text }]}>Who you should meet</Text>
      </View>

      <Card highlight={openToMeet.on} style={styles.toggleCard}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.toggleTitle, { color: c.text }]}>{openToMeet.on ? 'You’re open to meet' : 'Open to Meet'}</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            {openToMeet.on
              ? 'We’ll suggest people nearby who fit what you’re looking for.'
              : 'Turn on to get suggestions for people to meet right now.'}
          </Text>
          {openToMeet.error && <Text style={[styles.small, { color: c.danger }]}>{openToMeet.error}</Text>}
        </View>
        <Switch
          value={openToMeet.on}
          onValueChange={openToMeet.toggle}
          trackColor={{ true: c.tint, false: c.surfaceAlt }}
          accessibilityLabel="Open to Meet"
          style={{ transform: [{ scale: 1.2 }] }}
        />
      </Card>

      {/* AK7 (Akshar): mutual-yes meetups can share live location to find each other. */}
      <MeetupBanner />

      {suggestions.state.status === 'ready' && suggestions.state.data.suggestions.length > 0 && (
        <>
          <SectionTitle right={<AiBadge label="Suggested" />}>Meet now</SectionTitle>
          {suggestions.state.data.suggestions.map((s) => (
            <SuggestionCard key={s.suggestion_id} suggestion={s} />
          ))}
        </>
      )}

      <SectionTitle right={<AiBadge label="Ranked for you" />}>Your best matches</SectionTitle>
      {matches.state.status === 'loading' && <Loading label="Finding your matches…" />}
      {matches.state.status === 'error' && <ErrorState message={matches.state.message} onRetry={matches.reload} />}
      {matches.state.status === 'ready' &&
        (matches.state.data.matches.length === 0 ? (
          <Card>
            <Text style={[styles.cardTitle, { color: c.text }]}>No matches yet</Text>
            <Text style={[styles.body, { color: c.muted }]}>
              Check in to the event and add a resume or GitHub on your Profile so we can find your people.
            </Text>
          </Card>
        ) : (
          matches.state.data.matches.map((m) => <MatchCard key={m.user_id} match={m} />)
        ))}
    </ScrollView>
  );
}

function MatchCard({ match }: { match: Match }) {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.user_id } })} accessibilityRole="button">
      {({ pressed }) => (
        <Card highlight={match.highlight} style={{ opacity: pressed ? 0.85 : 1 }}>
          <View style={styles.personRow}>
            <Avatar name={match.name} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{match.name}</Text>
              <Text style={[styles.small, { color: c.muted }]}>
                {match.role === 'recruiter' ? 'Recruiter' : 'Student'}
                {match.proximity ? ` · ${proximityLabel(match.proximity)}` : ''}
              </Text>
            </View>
            {match.highlight && <Chip label="Top pick" tone="tint" />}
          </View>
          <MatchMeter score={match.score} />
          <View style={styles.chips}>
            {match.why.map((w) => (
              <Chip key={w} label={w} tone="ai" />
            ))}
          </View>
        </Card>
      )}
    </Pressable>
  );
}

// After "Yes", the card shows the same waiting state whatever the other person does (MASTER_SPEC 11).
function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const c = useColors();
  const [state, setState] = useState<'idle' | 'sending' | 'waiting' | 'matched' | 'dismissed'>('idle');
  const [error, setError] = useState<string | null>(null);

  const respond = async (response: 'yes' | 'no') => {
    setState('sending');
    setError(null);
    try {
      const res = await api.respondToSuggestion(suggestion.suggestion_id, response);
      if (response === 'no') setState('dismissed');
      else setState(res.status === 'matched' ? 'matched' : 'waiting');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (state === 'dismissed') return null;
  const other = suggestion.other;

  return (
    <Card highlight>
      <View style={styles.personRow}>
        <Avatar name={other.name} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.small, { color: c.muted }]}>Do you want to meet</Text>
          <Text style={[styles.cardTitle, { color: c.text }]}>{other.name}?</Text>
          {!!other.headline && <Text style={[styles.small, { color: c.muted }]}>{other.headline}</Text>}
        </View>
      </View>
      <View style={styles.chips}>
        {suggestion.shared_topics.map((t) => (
          <Chip key={t} label={t} tone="ai" />
        ))}
      </View>
      {state === 'waiting' ? (
        <View style={[styles.notice, { backgroundColor: c.tintSoft }]}>
          <Text style={[styles.body, { color: c.tint }]}>Nice. We’ll let you know if it’s a match.</Text>
        </View>
      ) : state === 'matched' ? (
        <View style={[styles.notice, { backgroundColor: c.successSoft }]}>
          <Text style={[styles.body, { color: c.success, fontWeight: '700' }]}>It’s a match! Say hi in your chats.</Text>
          <Button
            label={`Find ${other.name.split(' ')[0]}`}
            onPress={() => router.push({ pathname: '/meetup/[id]', params: { id: String(suggestion.suggestion_id) } })}
          />
        </View>
      ) : (
        <View style={styles.buttons}>
          <Button label="Not now" variant="secondary" onPress={() => respond('no')} disabled={state === 'sending'} style={{ flex: 1 }} />
          <Button label="Yes, let’s meet" onPress={() => respond('yes')} loading={state === 'sending'} style={{ flex: 1.4 }} />
        </View>
      )}
      {error && <Text style={[styles.small, { color: c.danger }]}>{error}</Text>}
    </Card>
  );
}

function proximityLabel(p: NonNullable<Match['proximity']>) {
  return { immediate: 'very close', near: 'nearby', far: 'farther away' }[p];
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  hero: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { fontSize: 20, fontWeight: '800' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 14 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttons: { flexDirection: 'row', gap: 10 },
  notice: { borderRadius: 12, padding: 12 },
});
