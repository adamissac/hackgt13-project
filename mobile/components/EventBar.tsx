// Shown across the top of every tab while you're inside an event (lib/eventSession). Left: "Leave event", which asks
// to confirm and then returns the app to everyone. Right: which event you're in and that only its attendees show.
// While the session is active it keeps Event Mode (Bluetooth) running, including after the app restarts.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enableEventMode, subscribeEventMode } from '@/features/ble/eventMode';
import { leaveEventSession, type EventSession } from '@/lib/eventSession';

import { useColors } from './ui';

export function confirmLeave(name: string): Promise<boolean> {
  const title = `Leave ${name}?`;
  const body = 'You’ll stop appearing to people at this event and the app goes back to everyone. You can scan back in later.';
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: 'Stay', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Leave event', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export function EventBar({ session }: { session: EventSession }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [leaving, setLeaving] = useState(false);
  const [radio, setRadio] = useState<{ on: boolean; error: string | null }>({ on: false, error: null });
  // Re-checked every minute so the bar says "Event ended" once the event is over.
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const check = () => setEnded(!!session.endsAt && Date.parse(session.endsAt) < Date.now());
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [session.endsAt]);

  useEffect(() => subscribeEventMode((s) => setRadio({ on: s.on, error: s.error })), []);
  // Scanning in was consent: keep Event Mode on for the whole session (resumes after a restart).
  useEffect(() => {
    if (!ended) void enableEventMode().catch(() => undefined);
  }, [session.eventId, ended]);

  const leave = async () => {
    if (leaving || !(await confirmLeave(session.name))) return;
    setLeaving(true);
    try {
      await leaveEventSession();
      router.navigate('/');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: c.tint }]}>
      <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel={`Leave ${session.name}`} hitSlop={8}
        style={({ pressed }) => [styles.leave, { opacity: pressed ? 0.8 : 1 }]}>
        {leaving ? <ActivityIndicator color={c.tint} size="small" /> : <Text style={[styles.leaveText, { color: c.tint }]}>✕ Leave event</Text>}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{ended ? 'Event ended · ' : ''}{session.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {radio.on ? '● Event Mode on · ' : radio.error ? 'Bluetooth unavailable · ' : ''}only people at this event
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  leave: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  leaveText: { fontSize: 13, fontWeight: '800' },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  sub: { color: '#C9D6F5', fontSize: 12, marginTop: 1 },
});
