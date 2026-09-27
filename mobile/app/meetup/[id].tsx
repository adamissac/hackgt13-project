import * as Location from 'expo-location';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, firstName, useColors } from '@/components/ui';
import { arrowDeg, bearingDeg, compassWord, distanceBand, distanceM, type LatLng } from '@/features/location/geo';
import { meetupMapsUrl } from '@/features/location/navigation';
import { api, type LocationShareState } from '@/lib/api';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// AK7 "find them" (MASTER_SPEC 7.6). After a mutual yes, both people can share foreground location for up to
// 30 minutes. The screen shows a rough distance band and an arrow toward the other person: no map, no meters,
// no coordinates. Sharing ends when they meet (verified conversation), either stops, Open to Meet goes off, or
// 30 minutes pass; the server deletes the rows.
const POST_EVERY_MS = 10_000;
const POLL_MS = 10_000;

type Phase = 'idle' | 'starting' | 'sharing' | 'ended';

export default function MeetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const suggestionId = Number(id);
  const c = useColors();

  const [info, setInfo] = useState<LocationShareState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const subs = useRef<Location.LocationSubscription[]>([]);
  const lastPost = useRef(0);

  const end = useCallback((why?: string) => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    setPhase('ended');
    if (why) setError(why);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.locationShare(suggestionId);
      setInfo(s);
      setLoadError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'sharing ended') end();
      else setLoadError(msg);
    }
  }, [suggestionId, end]);

  // Their position: Realtime pushes changes to the row RLS lets me read; polling covers mock mode and gaps.
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const channel = env.useMocks
      ? null
      : supabase
          .channel(`location-${suggestionId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'location_shares', filter: `suggestion_id=eq.${suggestionId}` },
            () => refresh(),
          )
          .subscribe();
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
      if (channel) supabase.removeChannel(channel);
    };
  }, [suggestionId, refresh]);

  // Stop the GPS when leaving the screen (foreground-only sharing).
  useEffect(() => () => subs.current.forEach((s) => s.remove()), []);

  const post = useCallback(
    async (p: LatLng) => {
      if (Date.now() - lastPost.current < POST_EVERY_MS - 500) return;
      lastPost.current = Date.now();
      try {
        const r = await api.shareLocation(suggestionId, p);
        setInfo((prev) => (prev ? { ...prev, sharing: true, expires_at: r.expires_at } : prev));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'sharing ended') end();
        else setError(msg);
      }
    },
    [suggestionId, end],
  );

  const start = async () => {
    setError(null);
    setPhase('starting');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setPhase('idle');
      setError(`Location unavailable. You can still message ${first} to pick a meeting spot.`);
      return;
    }
    try {
      const pos = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: POST_EVERY_MS, distanceInterval: 3 },
        (l) => {
          const p = { lat: l.coords.latitude, lng: l.coords.longitude };
          setMe(p);
          post(p);
        },
      );
      subs.current.push(pos);
      try {
        subs.current.push(await Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading)));
      } catch {
        // no compass (simulator): fall back to a compass word
      }
      setPhase('sharing');
    } catch (e) {
      setPhase('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    end();
    try {
      await api.stopLocationShare(suggestionId);
    } catch {
      // already ended server-side: nothing to do
    }
  };

  if (!info && !loadError && phase !== 'ended') return <Loading label="Opening meetup…" />;
  if (loadError && !info) return <ErrorState message={loadError} onRetry={refresh} />;

  const name = info?.other.name || 'them';
  const first = firstName(name);
  const them = info?.their_location ?? null;
  const expiresIn = info?.expires_at ? Math.max(0, Date.parse(info.expires_at) - now) : null;
  const theirAge = them ? Math.round((now - Date.parse(them.updated_at)) / 1000) : null;

  if (phase === 'ended' || expiresIn === 0) {
    return <Ended otherId={info?.other.user_id ?? null} name={name} />;
  }

  const bearing = me && them ? bearingDeg(me, them) : null;
  const band = me && them ? distanceBand(distanceM(me, them)) : null;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: `Find ${first}` }} />
      <View style={styles.row}>
        <Avatar name={name} size={56} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: c.text }]}>{name}</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {expiresIn != null ? `Sharing ends in ${Math.ceil(expiresIn / 60000)} min` : 'You both said yes'}
          </Text>
        </View>
      </View>

      <Card style={styles.finder}>
        {phase !== 'sharing' ? (
          <>
            <Text style={[styles.body, { color: c.text, textAlign: 'center' }]}>
              Share your location with {first} for up to 30 minutes so you can find each other. It stops when you meet.
            </Text>
            <Button label="Share my location" onPress={start} loading={phase === 'starting'} />
          </>
        ) : !them ? (
          <>
            <Loading label={`Waiting for ${first} to share…`} />
            <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>You&apos;re sharing. They&apos;ll see you.</Text>
          </>
        ) : !me ? (
          <Loading label="Finding your position…" />
        ) : (
          <>
            <View
              style={{ transform: [{ rotate: `${arrowDeg(bearing!, heading)}deg` }] }}
              accessibilityLabel={`${first} is to the ${compassWord(bearing!)}`}>
              <Svg width={160} height={160} viewBox="0 0 100 100">
                <Path d="M50 6 L80 88 L50 70 L20 88 Z" fill={band!.close ? c.success : c.tint} />
              </Svg>
            </View>
            <Text style={[styles.band, { color: band!.close ? c.success : c.text }]}>{band!.label}</Text>
            <Text style={[styles.small, { color: c.muted }]}>
              {heading == null ? `Head ${compassWord(bearing!)}. ` : ''}
              {theirAge != null && theirAge > 30 ? `${first}'s location is ${Math.round(theirAge / 60) || 1} min old` : 'Live'}
            </Text>
          </>
        )}
        {error ? <Text style={[styles.small, { color: c.danger, textAlign: 'center' }]}>{error}</Text> : null}
      </Card>

      {band?.close ? (
        <Button label="Found them? Verify with QR" onPress={() => router.push('/verify')} />
      ) : null}
      {phase === 'sharing' && them ? (
        <Button
          label={`Navigate to ${first}`}
          variant="secondary"
          onPress={() => { void Linking.openURL(meetupMapsUrl(them)).catch(() => setError('Could not open Maps.')); }}
        />
      ) : null}
      {info && (
        <Button
          label={`Message ${first}`}
          variant="secondary"
          onPress={async () => {
            const rel = await api.relationship(info.other.user_id).catch(() => null);
            if (rel?.chat_id != null) router.push({ pathname: '/chat/[id]', params: { id: String(rel.chat_id), name, other: info.other.user_id } });
          }}
        />
      )}
      {phase === 'sharing' ? <Button label="Stop sharing" variant="ghost" onPress={stop} /> : null}
      {env.useMocks && info && (
        <Button
          label="Demo: we met and talked (simulate Bluetooth)"
          variant="ghost"
          onPress={async () => {
            const conv = await api.simulateConversation(info.other.user_id);
            router.replace({ pathname: '/checklist/[id]', params: { id: String(conv.conversation_id) } });
          }}
        />
      )}
      <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>
        Maps is available only after you both chose this meetup and both started temporary sharing. Location is deleted when sharing ends.
      </Text>
    </ScrollView>
  );
}

/** Sharing is over: either they met (checklist is waiting) or it stopped/expired. */
function Ended({ otherId, name }: { otherId: string | null; name: string }) {
  const c = useColors();
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    if (!otherId) return;
    api
      .pendingConversations()
      .then((r) => setPending(r.conversations.find((x) => x.other.user_id === otherId)?.conversation_id ?? null))
      .catch(() => undefined);
  }, [otherId]);
  const first = firstName(name);
  return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: 'Find each other' }} />
      {pending !== null ? (
        <>
          <Text style={{ fontSize: 44 }}>✓</Text>
          <Text style={[styles.title, { color: c.text }]}>Conversation verified</Text>
          <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>
            You and {first} talked in person. Location sharing stopped and was deleted.
          </Text>
          <Button label="How did it go?" onPress={() => router.replace({ pathname: '/checklist/[id]', params: { id: String(pending) } })} />
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: c.text }]}>Location sharing ended</Text>
          <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>
            Locations were deleted. If you found each other, verify with the QR code to connect.
          </Text>
          <Button label="Verify with QR" onPress={() => router.replace('/verify')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14 },
  finder: { alignItems: 'center', gap: 14, paddingVertical: 24, minHeight: 280, justifyContent: 'center' },
  band: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
});
