import { Link, router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { Avatar, Button, Card, Chip, Disclosure, SectionTitle, useColors } from '@/components/ui';
import { useProximity } from '@/features/ble';
import { EventModeCard } from '@/features/ble/EventModeCard';
import { BAND_HINT, BANDS } from '@/features/nearby/geo';
import { NearbyRadar, type RadarPeer } from '@/features/nearby/NearbyRadar';
import { useOpenToMeet } from '@/features/presence/openToMeet';
import { api } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { useAsync } from '@/lib/useAsync';

// Nearby (MASTER_SPEC 3.4). Discovery runs while Open to Meet is on. Distances are rough bands from
// Bluetooth, never meters or directions. Scanning/radio: Akshar (features/ble).
export default function NearbyScreen() {
  const c = useColors();
  const presence = useOpenToMeet();
  const { peers, radio, radioError, fetchError } = useProximity(presence.on);
  // Match strength for the radar and the "at this event" fallback list.
  const all = useAsync(() => api.matches(HACKGT_EVENT_ID), [], ['relationships', 'profile']);
  const scores = new Map(all.state.status === 'ready' ? all.state.data.matches.map((m) => [m.user_id, m.score]) : []);
  const radarPeers: RadarPeer[] = peers.map((p) => ({ ...p, score: scores.get(p.user_id) ?? 0.5 }));
  const open = (id: string) => router.push({ pathname: '/match/[id]', params: { id } });

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Card highlight={presence.on} style={styles.toggleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.h1, { color: c.text }]}>{presence.on ? 'Discovering nearby' : 'Discovery paused'}</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {presence.on ? 'Only your matches show up, as rough distance.' : 'Turn on Open to Meet to find matches in the room.'}
          </Text>
        </View>
        <Switch
          value={presence.on}
          onValueChange={presence.toggle}
          disabled={presence.status === 'loading' || presence.status === 'saving'}
          accessibilityLabel="Open to Meet"
        />
      </Card>

      {presence.on && <RadioStatus radio={radio} radioError={radioError} />}

      {!presence.on ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 44 }}>📡</Text>
          <Text style={[styles.h1, { color: c.text, textAlign: 'center' }]}>A good conversation could be a few steps away</Text>
          <Button label="Turn on Open to Meet" onPress={() => presence.toggle(true)} loading={presence.status === 'saving'} />
        </View>
      ) : fetchError ? (
        <ErrorState message={fetchError} onRetry={all.reload} />
      ) : peers.length === 0 ? (
        <>
          <Card>
            <Loading label="Looking for your matches nearby…" />
            <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>
              Nobody detected close by yet. Matches at the event are below.
            </Text>
          </Card>
          {all.state.status === 'ready' && all.state.data.matches.length > 0 && (
            <>
              <SectionTitle>At HackGT 13</SectionTitle>
              <Card style={{ paddingVertical: 4 }}>
                {all.state.data.matches.slice(0, 6).map((m, i) => (
                  <PersonRow key={m.user_id} name={m.name} score={m.score} why={m.why} divider={i > 0} onPress={() => open(m.user_id)} />
                ))}
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <NearbyRadar peers={radarPeers} onSelect={open} />
          <Text style={[styles.small, { color: c.muted, textAlign: 'center' }]}>
            Rings are rough distance. Dot position isn’t direction. Bigger, filled dots are stronger matches.
          </Text>
          {BANDS.map((band) => {
            const inBand = radarPeers.filter((p) => p.band === band).sort((a, b) => b.score - a.score);
            if (!inBand.length) return null;
            return (
              <View key={band} style={{ gap: 8 }}>
                <SectionTitle>{`${band} · ${BAND_HINT[band]}`}</SectionTitle>
                <Card style={{ paddingVertical: 4 }}>
                  {inBand.map((p, i) => (
                    <PersonRow key={p.user_id} name={p.name} score={p.score} why={p.why ?? []} divider={i > 0} onPress={() => open(p.user_id)} />
                  ))}
                </Card>
              </View>
            );
          })}
        </>
      )}

      <Link href="/verify" style={[styles.link, { color: c.tint }]}>
        Just talked with someone? Verify with QR →
      </Link>
      {radio !== 'demo' && (
        <Disclosure title="Event mode" subtitle="Keep scanning while your phone is in your pocket">
          <EventModeCard />
        </Disclosure>
      )}
      {__DEV__ && radio !== 'demo' ? (
        <Disclosure title="Developer tools">
          <Link href="/ble-debug" style={[styles.devLink, { color: c.muted }]}>BLE hello world</Link>
          <Link href="/record" style={[styles.devLink, { color: c.muted }]}>Record session (AK6)</Link>
        </Disclosure>
      ) : null}
    </ScrollView>
  );
}

function RadioStatus({ radio, radioError }: { radio: 'demo' | 'off' | 'on'; radioError: string | null }) {
  const c = useColors();
  const denied = !!radioError && /permission|denied|unauthori/i.test(radioError);
  const text =
    radio === 'demo'
      ? 'Demo mode: nearby people are simulated.'
      : radio === 'off'
        ? 'Bluetooth isn’t in this build, so distance comes from the server only.'
        : radioError
          ? denied
            ? 'Nearby discovery needs Bluetooth access.'
            : radioError
          : 'Bluetooth is scanning.';
  return (
    <View style={[styles.status, { backgroundColor: radioError ? c.aiSoft : c.surfaceAlt }]}>
      <Text style={[styles.small, { color: c.text, flex: 1 }]}>
        {radio === 'on' && !radioError ? '● ' : ''}
        {text}
      </Text>
      {denied && (
        <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: c.tint, fontWeight: '800' }}>Open Settings</Text>
        </Pressable>
      )}
    </View>
  );
}

function PersonRow({ name, score, why, divider, onPress }: { name: string; score: number; why: string[]; divider: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { opacity: 0.7 }]}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.rowName, { color: c.text }]}>{name}</Text>
        <View style={styles.chips}>
          {why.slice(0, 2).map((w) => (
            <Chip key={w} label={w} tone="ai" />
          ))}
        </View>
      </View>
      <Text style={[styles.score, { color: score >= 0.8 ? c.tint : c.text }]}>{Math.round(score * 100)}%</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { fontSize: 18, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  rowName: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  score: { fontSize: 17, fontWeight: '800' },
  link: { fontSize: 16, fontWeight: '700', paddingVertical: 8, textAlign: 'center' },
  devLink: { fontSize: 14, paddingVertical: 8 },
});
