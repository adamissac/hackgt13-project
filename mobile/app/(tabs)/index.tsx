import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, SectionTitle, useColors } from '@/components/ui';
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
  const [showAll, setShowAll] = useState(false);

  const refresh = () => {
    matches.reload();
    suggestions.reload();
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <View style={styles.masthead}>
        <Text style={[styles.wordmark, { color: c.text }]}>formal connection</Text>
        <Text style={[styles.eyebrow, { color: c.tint }]}>HackGT 13</Text>
      </View>
      <View style={styles.intro}>
        <Text style={[styles.hero, { color: c.text }]}>Good conversations{ '\n' }start here.</Text>
        <Text style={[styles.body, { color: c.muted }]}>A few people with something in common.</Text>
        <Pressable onPress={() => router.push('/chats')} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[styles.small, { color: c.tint, fontWeight: '600' }]}>Your chats →</Text>
        </Pressable>
      </View>

      <Card highlight={openToMeet.on} style={styles.toggleCard}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.toggleTitle, { color: c.text }]}>Open to meet</Text>
          <Text style={[styles.body, { color: c.muted }]}>
            {openToMeet.on
              ? 'You’re available for nearby introductions.'
              : 'Turn on when you’re ready to say hello.'}
          </Text>
          {openToMeet.error && <Text style={[styles.small, { color: c.danger }]}>{openToMeet.error}</Text>}
        </View>
        <Switch
          value={openToMeet.on}
          onValueChange={openToMeet.toggle}
          trackColor={{ true: c.tint, false: c.surfaceAlt }}
          accessibilityLabel="Open to Meet"
        />
      </Card>

      {/* AK7 (Akshar): mutual-yes meetups can share live location to find each other. */}
      <CheckInCard />

      {/* AK7 (Akshar): mutual-yes meetups can share live location to find each other. */}
      <MeetupBanner />

      {suggestions.state.status === 'ready' && suggestions.state.data.suggestions.length > 0 && (
        <>
          <SectionTitle>Ready to say hello?</SectionTitle>
          {suggestions.state.data.suggestions.map((s) => (
            <SuggestionCard key={s.suggestion_id} suggestion={s} />
          ))}
        </>
      )}

      {suggestions.state.status === 'error' && <ErrorState message="Introductions couldn’t load." onRetry={suggestions.reload} />}
      <SectionTitle right={<Text style={[styles.small, { color: c.muted }]}>AI suggested</Text>}>People to meet</SectionTitle>
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
          <>
            {matches.state.data.matches.slice(0, showAll ? undefined : 3).map((m) => <MatchCard key={m.user_id} match={m} />)}
            {matches.state.data.matches.length > 3 && (
              <Button label={showAll ? 'Show fewer people' : `See ${matches.state.data.matches.length - 3} more people`} variant="ghost" onPress={() => setShowAll(!showAll)} />
            )}
          </>
        ))}
      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <Text style={[styles.body, { color: c.muted }]}>Already had a good conversation?</Text>
        <Button label="Verify a conversation" variant="secondary" onPress={() => router.push('/verify')} />
      </View>
    </ScrollView>
  );
}

function CheckInCard() {
  const c = useColors();
  const [state, setState] = useState<'idle' | 'sending' | 'in'>('idle');
  const [error, setError] = useState<string | null>(null);

  const checkIn = async () => {
    setState('sending');
    setError(null);
    try {
      await api.checkin(HACKGT_EVENT_ID);
      setState('in');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <Text style={[styles.cardTitle, { color: c.text }]}>{state === 'in' ? 'You’re checked in' : 'Check in to HackGT 13'}</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        {state === 'in'
          ? 'Matches and suggestions for this event can reach you now.'
          : 'Check in so we can match you with people who are here.'}
      </Text>
      {state !== 'in' && <Button label="Check in" onPress={checkIn} loading={state === 'sending'} />}
      {error && <Text style={[styles.small, { color: c.danger }]}>{error}</Text>}
    </Card>
  );
}

function MatchCard({ match }: { match: Match }) {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.user_id } })} accessibilityRole="button" accessibilityLabel={`View ${match.name}'s profile`}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.85 : 1 }}>
          <View style={styles.personRow}>
            <Avatar name={match.name} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{match.name}</Text>
              <Text style={[styles.small, { color: c.muted }]}>
                {match.role === 'recruiter' ? 'Recruiter' : 'Student'}
                {match.proximity ? ` · ${proximityLabel(match.proximity)}` : ''}
              </Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 24 }}>›</Text>
          </View>
          <Text style={[styles.body, { color: c.muted }]} numberOfLines={2}>
            {match.why.length ? `You share an interest in ${match.why.slice(0, 2).join(' and ')}.` : 'Explore what you have in common.'}
          </Text>
          {match.highlight && <Text style={[styles.small, { color: c.tint, fontWeight: '600' }]}>A strong match for you</Text>}
        </Card>
      )}
    </Pressable>
  );
}

// After "Yes", the card shows the same waiting state whatever the other person does (MASTER_SPEC 11).
function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const c = useColors();
  const [state, setState] = useState<'idle' | 'sending' | 'waiting' | 'matched' | 'dismissed'>('idle');
  const [chatId, setChatId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (response: 'yes' | 'no') => {
    setState('sending');
    setError(null);
    try {
      const res = await api.respondToSuggestion(suggestion.suggestion_id, response);
      if (response === 'no') setState('dismissed');
      else if (res.status === 'matched') {
        setChatId(res.chat_id);
        setState('matched');
      } else setState('waiting');
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
          <Text style={[styles.body, { color: c.success, fontWeight: '700' }]}>It’s a match. Say hi — only the two of you can see this chat.</Text>
          {chatId !== null && (
            <Button
              label={`Chat with ${other.name.split(' ')[0]}`}
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: String(chatId), name: other.name, other: other.user_id },
                })
              }
            />
          )}
          <Button
            label={`Find ${other.name.split(' ')[0]}`}
            variant="secondary"
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
  container: { padding: 24, gap: 18, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  masthead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  wordmark: { fontSize: 16, fontWeight: '600', letterSpacing: -0.6 },
  eyebrow: { fontSize: 12, fontWeight: '600' },
  intro: { gap: 10, paddingTop: 16, paddingBottom: 10 },
  hero: { fontSize: 36, lineHeight: 41, fontWeight: '500', letterSpacing: -1.5 },
  footer: { borderTopWidth: 1, marginTop: 8, paddingTop: 24, gap: 12 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { fontSize: 17, fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 14 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttons: { flexDirection: 'row', gap: 10 },
  notice: { borderRadius: 12, padding: 12 },
});
