// AK7: on Home, one card per mutual-yes meetup that can still share location ("Find Maya").
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, firstName, useColors } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

export function MeetupBanner() {
  const c = useColors();
  const { state } = useAsync(() => api.meetups(), []);
  if (state.status !== 'ready' || state.data.meetups.length === 0) return null; // quiet when there's nothing
  return (
    <>
      {state.data.meetups.map((m) => (
        <Card key={m.suggestion_id} highlight>
          <View style={styles.row}>
            <Avatar name={m.other.name} size={48} />
            <View style={styles.flex}>
              <Text style={[styles.title, { color: c.text }]}>You&apos;re meeting {m.other.name || 'your match'}</Text>
              <Text style={[styles.small, { color: c.muted }]}>Share locations for 30 minutes to find each other.</Text>
            </View>
          </View>
          <Button
            label={`Find ${firstName(m.other.name)}`}
            onPress={() => router.push({ pathname: '/meetup/[id]', params: { id: String(m.suggestion_id) } })}
          />
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  small: { fontSize: 14 },
});
