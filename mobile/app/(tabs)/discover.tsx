import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderActions } from '@/components/HeaderActions';
import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Button, Card, Chip, firstName, SectionTitle, useColors } from '@/components/ui';
import { listChats } from '@/features/chat/store';
import { NearbySection, VerifyLinks } from '@/features/nearby/NearbySection';
import { useOpenToMeet } from '@/features/presence/openToMeet';
import { api, type Match, type Meetup, type PendingConversation, type Suggestion } from '@/lib/api';
import { useEventSession } from '@/lib/eventSession';
import { useCurrentEventId } from '@/lib/useCurrentEvent';
import { useAsync } from '@/lib/useAsync';

const BAND = { immediate: 'Very close', near: 'Nearby', far: 'Farther away' } as const;

// Home: the core loop at a glance. 1) Open to Meet + scan who's nearby, 2) the one thing to do next, 3) best matches.
export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const presence = useOpenToMeet();
  const eventId = useCurrentEventId();
  const eventSession = useEventSession(); // inside a company event, Home shows only its attendees
  const matches = useAsync(() => api.matches(eventId), [eventId], ['relationships', 'profile']);
  const next = useAsync(
    async () => {
      const [pending, meetups, suggestions] = await Promise.all([
        api.pendingConversations().catch(() => ({ conversations: [] as PendingConversation[] })),
        api.meetups().catch(() => ({ meetups: [] as Meetup[] })),
        api.suggestions().catch(() => ({ suggestions: [] as Suggestion[] })),
      ]);
      return { pending: pending.conversations, meetups: meetups.meetups, suggestions: suggestions.suggestions };
    },
    [presence.on],
    ['relationships', 'meetups', 'chats'],
  );

  const refresh = () => {
    matches.reload();
    next.reload();
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 8 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: c.tint }]}>{eventSession ? eventSession.name : 'HackGT 13'}</Text>
          <Text style={[styles.title, { color: c.text }]}>Find your people.</Text>
        </View>
        <HeaderActions />
      </View>

      <FinishProfileBanner />

      <OpenToMeetCard presence={presence} />

      <NearbySection />

      <UpNext state={next.state} onRetry={next.reload} />

      <SectionTitle right={<AiBadge label="AI ranked" />}>Your best matches</SectionTitle>
      {matches.state.status === 'loading' && <Loading label="Finding your matches…" />}
      {matches.state.status === 'error' && <ErrorState message={matches.state.message} onRetry={matches.reload} />}
      {matches.state.status === 'ready' &&
        (matches.state.data.matches.length === 0 ? (
          <Card>
            <Text style={[styles.cardTitle, { color: c.text }]}>No matches yet</Text>
            <Text style={[styles.body, { color: c.muted }]}>Add a resume or GitHub on your Profile so we can find your people.</Text>
            <Button label="Build my profile" variant="secondary" onPress={() => router.push('/accounts')} />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {matches.state.data.matches.slice(0, 3).map((m, i) => (
              <MatchRow key={m.user_id} match={m} divider={i > 0} />
            ))}
          </Card>
        ))}

      <VerifyLinks />
    </ScrollView>
  );
}

/** Re-prompt until the profile builder has run once (onboarding_status !== 'complete'). Dismiss hides it for this session. */
let bannerDismissed = false;
function FinishProfileBanner() {
  const c = useColors();
  const status = useAsync(() => api.onboardingStatus(), [], ['profile']);
  const [hidden, setHidden] = useState(bannerDismissed);
  if (hidden || status.state.status !== 'ready' || status.state.data === 'complete') return null;
  return (
    <View style={[styles.banner, { backgroundColor: c.aiSoft }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.cardTitle, { color: c.text, fontSize: 16 }]}>Finish your profile</Text>
        <Text style={[styles.small, { color: c.muted }]}>Add GitHub or a resume so we can find better matches.</Text>
      </View>
      <Button label="Add" onPress={() => router.push('/accounts')} style={{ minHeight: 44, paddingHorizontal: 16 }} />
      <Pressable
        onPress={() => {
          bannerDismissed = true;
          setHidden(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={10}>
        <Text style={{ color: c.muted, fontSize: 18 }}>✕</Text>
      </Pressable>
    </View>
  );
}

function OpenToMeetCard({ presence }: { presence: ReturnType<typeof useOpenToMeet> }) {
  const c = useColors();
  const on = presence.on;
  return (
    <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.heroRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.heroLabel, { color: c.muted }]}>{on ? 'AVAILABLE' : 'PAUSED'}</Text>
          <Text style={[styles.heroTitle, { color: c.text }]}>Open to meet</Text>
        </View>
        <Switch
          value={on}
          onValueChange={presence.toggle}
          disabled={presence.status === 'loading' || presence.status === 'saving'}
          trackColor={{ true: c.tint, false: c.surfaceAlt }}
          accessibilityLabel="Open to Meet"
        />
      </View>
      <Text style={[styles.body, { color: c.muted }]}>
        {on
          ? 'Available for nearby introductions. Your exact location stays private.'
          : 'Turn on when you’re ready for nearby introductions.'}
      </Text>
      {presence.error && <Text style={[styles.small, { color: c.danger }]}>{presence.error}</Text>}
    </View>
  );
}

type NextData = { pending: PendingConversation[]; meetups: Meetup[]; suggestions: Suggestion[] };

/** The single most important next step, in loop order: finish a conversation > meet a match > answer a suggestion. */
function UpNext({ state, onRetry }: { state: ReturnType<typeof useAsync<NextData>>['state']; onRetry: () => void }) {
  if (state.status === 'loading') return null;
  if (state.status === 'error') return <ErrorState message="Couldn’t load your next step." onRetry={onRetry} />;
  const { pending, meetups, suggestions } = state.data;
  if (pending[0]) return <PendingCard item={pending[0]} />;
  if (meetups[0]) return <MutualCard meetup={meetups[0]} />;
  if (suggestions[0]) return <SuggestionCard suggestion={suggestions[0]} />;
  return null;
}

function PendingCard({ item }: { item: PendingConversation }) {
  const c = useColors();
  const first = firstName(item.other.name);
  return (
    <Card highlight>
      <Chip label="✓ Conversation verified" tone="success" />
      <View style={styles.personRow}>
        <Avatar name={item.other.name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>How did it go with {first}?</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {item.minutes ? `You talked for about ${Math.round(item.minutes)} minutes. ` : ''}They only hear back if you both want to connect.
          </Text>
        </View>
      </View>
      <Button label="Answer two quick questions" onPress={() => router.push({ pathname: '/checklist/[id]', params: { id: String(item.conversation_id) } })} />
    </Card>
  );
}

function MutualCard({ meetup }: { meetup: Meetup }) {
  const c = useColors();
  const [opening, setOpening] = useState(false);
  const first = firstName(meetup.other.name);
  const openChat = async () => {
    setOpening(true);
    try {
      const chat = (await listChats('')).find((x) => x.other_user_id === meetup.other.user_id);
      if (chat) router.push({ pathname: '/chat/[id]', params: { id: String(chat.id), name: chat.other_name, other: chat.other_user_id } });
      else router.push('/chats');
    } finally {
      setOpening(false);
    }
  };
  return (
    <Card highlight>
      <Chip label="You both want to meet" tone="success" />
      <View style={styles.personRow}>
        <Avatar name={meetup.other.name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{meetup.other.name}</Text>
          <Text style={[styles.small, { color: c.muted }]}>Say hi, then find each other in the room.</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label="Message" variant="secondary" onPress={openChat} loading={opening} style={{ flex: 1 }} />
        <Button
          label={`Find ${first}`}
          onPress={() => router.push({ pathname: '/meetup/[id]', params: { id: String(meetup.suggestion_id) } })}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

// After "Want to meet" the card shows the same waiting state whatever the other person does (MASTER_SPEC 11).
function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const c = useColors();
  const [state, setState] = useState<'idle' | 'sending' | 'waiting' | 'hidden'>('idle');
  const [error, setError] = useState<string | null>(null);
  const other = suggestion.other;

  const respond = async (response: 'yes' | 'no') => {
    if (state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      await api.respondToSuggestion(suggestion.suggestion_id, response);
      setState(response === 'no' ? 'hidden' : 'waiting');
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (state === 'hidden') return null;
  return (
    <Card highlight>
      <AiBadge label={`Suggested · ${Math.round(suggestion.score * 100)}% match`} />
      <Pressable
        onPress={() => router.push({ pathname: '/match/[id]', params: { id: other.user_id } })}
        accessibilityRole="button"
        style={styles.personRow}>
        <Avatar name={other.name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Want to meet {other.name}?</Text>
          {!!other.headline && <Text style={[styles.small, { color: c.muted }]}>{other.headline}</Text>}
        </View>
        <Text style={{ color: c.muted, fontSize: 24 }}>›</Text>
      </Pressable>
      <View style={styles.chips}>
        {suggestion.shared_topics.slice(0, 3).map((t) => (
          <Chip key={t} label={t} tone="ai" />
        ))}
      </View>
      {state === 'waiting' ? (
        <View style={[styles.notice, { backgroundColor: c.tintSoft }]}>
          <Text style={[styles.body, { color: c.tint }]}>Nice. If it’s mutual, your chat opens here.</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <Button label="Not now" variant="secondary" onPress={() => respond('no')} disabled={state === 'sending'} style={{ flex: 1 }} />
          <Button label="Want to meet" onPress={() => respond('yes')} loading={state === 'sending'} style={{ flex: 1.3 }} />
        </View>
      )}
      {error && <Text style={[styles.small, { color: c.danger }]}>{error}</Text>}
    </Card>
  );
}

function MatchRow({ match, divider }: { match: Match; divider: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.user_id } })}
      accessibilityRole="button"
      accessibilityLabel={`${match.name}, ${Math.round(match.score * 100)} percent match`}
      style={({ pressed }) => [styles.matchRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { opacity: 0.7 }]}>
      <Avatar name={match.name} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowName, { color: c.text }]} numberOfLines={1}>
          {match.name}
        </Text>
        <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
          {match.why.slice(0, 2).join(' · ') || 'Explore what you have in common'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[styles.score, { color: match.highlight ? c.tint : c.text }]}>{Math.round(match.score * 100)}%</Text>
        {match.proximity && <Text style={[styles.tiny, { color: c.muted }]}>{BAND[match.proximity]}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 110, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  bell: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hero: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  heroButton: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 14, lineHeight: 19 },
  tiny: { fontSize: 12, fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttons: { flexDirection: 'row', gap: 10 },
  notice: { borderRadius: 12, padding: 12 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 68 },
  rowName: { fontSize: 17, fontWeight: '700' },
  score: { fontSize: 18, fontWeight: '800' },
  more: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, alignItems: 'center' },
  ask: { borderRadius: 18, padding: 16, gap: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  askTitle: { fontSize: 16, fontWeight: '800' },
});
