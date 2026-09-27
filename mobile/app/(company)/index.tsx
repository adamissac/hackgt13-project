import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading } from '@/components/States';
import { Button, Card, SectionTitle, useColors } from '@/components/ui';
import { useOrg } from '@/lib/useOrg';

export default function CompanyHome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { loading, error, org, events, reload } = useOrg();

  if (loading) return <Loading label="Loading your company…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 12, paddingBottom: 88 + insets.bottom }]}>
      <Text style={[styles.kicker, { color: c.tint }]}>COMPANY</Text>
      <Text style={[styles.title, { color: c.text }]}>{org?.name ?? 'Your company'}</Text>
      <Text style={[styles.body, { color: c.muted }]}>
        Create an event, send a join code or QR, and promote it. You see counts, not attendee names.
      </Text>
      <Button label="Create an event" onPress={() => router.push('/(company)/new')} />
      <SectionTitle>Your events</SectionTitle>
      {events.length === 0 ? (
        <Card>
          <Text style={[styles.body, { color: c.text }]}>No events yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>People join with a code or QR. Nearby then shows only that room.</Text>
        </Card>
      ) : (
        events.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => router.push({ pathname: '/(company)/event/[id]', params: { id: String(e.id) } })}
            accessibilityRole="button">
            <Card>
              <Text style={[styles.body, { color: c.text, fontWeight: '700' }]}>{e.name}</Text>
              <Text style={[styles.body, { color: c.muted }]}>{e.location || 'Location TBD'}</Text>
              <View style={styles.row}>
                <Text style={[styles.stat, { color: c.text }]}>{e.registered} registered</Text>
                <Text style={[styles.stat, { color: c.text }]}>{e.checked_in} in the room</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { fontSize: 13, fontWeight: '700' },
});
