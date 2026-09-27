// Bluetooth connecting inside an event session (app/attend/[id].tsx). Event Mode keeps this phone advertising and
// scanning; people found are only other attendees checked in to the same event (the server resolves rotating IDs
// and only returns current matches). Distances are bands, never positions. Connecting still needs a verified
// conversation and both people saying yes (QR verify, or the encounter classifier after a Bluetooth conversation).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, useColors } from '@/components/ui';
import { BAND_HINT } from '@/features/nearby/geo';

import { EventModeCard } from './EventModeCard';
import { subscribeEventMode } from './eventMode';
import { useProximity } from './index';

export function EventConnect() {
  const c = useColors();
  const [on, setOn] = useState(false);
  useEffect(() => subscribeEventMode((s) => setOn(s.on)), []);
  const { peers, radioError } = useProximity(on);
  const near = radioError ? [] : peers.filter((p) => p.band);

  return (
    <View style={[styles.wrap, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Text style={[styles.title, { color: c.text }]}>Connect with people here</Text>
      <Text style={[styles.small, { color: c.muted }]}>
        Turn on Event Mode so your phone finds other checked-in attendees over Bluetooth. After you talk with someone, you
        both confirm to connect. Nobody sees a “no”.
      </Text>
      <EventModeCard />
      {on && !radioError && (
        near.length === 0 ? (
          <Text style={[styles.small, { color: c.muted }]}>Looking for attendees near you…</Text>
        ) : (
          <View style={{ gap: 2 }}>
            {near.slice(0, 8).map((p) => (
              <Pressable key={p.user_id} onPress={() => router.push({ pathname: '/match/[id]', params: { id: p.user_id } })}
                accessibilityRole="button" style={[styles.row, { borderBottomColor: c.border }]}>
                <Avatar name={p.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.text }]}>{p.name}</Text>
                  <Text style={[styles.small, { color: c.muted }]}>{p.band}: {BAND_HINT[p.band]}</Text>
                </View>
                <Text style={{ color: c.tint, fontWeight: '700' }}>View</Text>
              </Pressable>
            ))}
          </View>
        )
      )}
      <Button label="Just talked with someone? Verify to connect" variant="secondary" onPress={() => router.push('/verify')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  small: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 15, fontWeight: '700' },
});
