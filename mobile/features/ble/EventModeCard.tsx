// AK8: Event Mode switch + honest status for the Nearby tab.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, useColors } from '@/components/ui';

import { subscribe, type EngineSnapshot } from './engine';
import { disableEventMode, enableEventMode, subscribeEventMode, wasEventModeOn, type EventModeStatus } from './eventMode';

export function EventModeCard() {
  const c = useColors();
  const [status, setStatus] = useState<EventModeStatus | null>(null);
  const [engine, setEngine] = useState<EngineSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerResume, setOfferResume] = useState(false);

  useEffect(() => subscribeEventMode(setStatus), []);
  useEffect(() => subscribe(setEngine), []);
  useEffect(() => {
    wasEventModeOn().then((was) => setOfferResume(was));
  }, []);

  const on = status?.on ?? false;
  const toggle = async (next: boolean) => {
    setBusy(true);
    setOfferResume(false);
    try {
      if (next) await enableEventMode();
      else await disableEventMode();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card highlight={on}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: c.text }]}>Event Mode</Text>
          <Text style={[styles.small, { color: c.muted }]}>
            {on ? 'On: finding matches around you' : 'Turn on while you’re at the event'}
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ true: c.tint, false: c.surfaceAlt }}
          accessibilityLabel="Event Mode"
          style={{ transform: [{ scale: 1.2 }] }}
        />
      </View>

      {on ? (
        <View style={styles.lines}>
          <Text style={[styles.small, { color: c.text }]}>• Screen stays on</Text>
          {Platform.OS === 'android' ? (
            <Text style={[styles.small, { color: status?.backgroundService === 'running' ? c.text : c.danger }]}>
              {status?.backgroundService === 'running'
                ? '• Keeps scanning when your phone is locked (see the notification)'
                : '• Background scanning is off: keep the app open'}
            </Text>
          ) : (
            <Text style={[styles.small, { color: c.text }]}>• Keep the app open: iPhones only scan while it’s on screen</Text>
          )}
          <Text style={[styles.small, { color: c.muted }]}>
            {engine?.running ? `${engine.heard.length} phone${engine.heard.length === 1 ? '' : 's'} with the app nearby` : 'Starting Bluetooth…'}
          </Text>
        </View>
      ) : offerResume ? (
        <Button label="Resume Event Mode" variant="secondary" onPress={() => toggle(true)} loading={busy} />
      ) : null}

      {status?.error ? <Text style={[styles.small, { color: status.needsCheckIn ? c.muted : c.danger }]}>{status.error}</Text> : null}
      {status?.needsCheckIn ? <Button label="Scan event QR code" onPress={() => router.push('/join-event')} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  small: { fontSize: 14, lineHeight: 20 },
  lines: { gap: 4 },
});
