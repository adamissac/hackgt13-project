import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch } from 'react-native';

import { Empty, ErrorState, Loading } from '@/components/States';
import { Text, View } from '@/components/Themed';
import { useProximity } from '@/features/ble';

// Nearby matches over Bluetooth (MASTER_SPEC 3.4). The radar and the real scanning are
// Akshar's (features/ble). Distances are bands only, never meters.
export default function NearbyScreen() {
  const [scan, setScan] = useState(false);
  const { scanning, peers, error } = useProximity(scan);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan for people nearby</Text>
        <Switch value={scan} onValueChange={setScan} accessibilityLabel="Scan for people nearby" />
      </View>
      {/* AK3 (Akshar): QR verification fallback, always available. */}
      <Link href="/verify" style={styles.verifyLink}>
        Just talked with someone? Verify with QR
      </Link>
      {error ? (
        <ErrorState message={error} onRetry={() => setScan(true)} />
      ) : !scan ? (
        <Empty title="Scanning is off" body="Turn it on to see matches within Bluetooth range." />
      ) : scanning && peers.length === 0 ? (
        <Loading label="Looking for people nearby…" />
      ) : (
        <FlatList
          data={peers}
          keyExtractor={(p) => p.user_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.band}>{item.band}</Text>
            </View>
          )}
          ListEmptyComponent={<Empty title="No one nearby yet" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  verifyLink: { fontSize: 16, fontWeight: '600', color: '#2f95dc', paddingHorizontal: 16, paddingVertical: 12 },
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  title: { fontSize: 20, fontWeight: '600' },
  list: { gap: 10, paddingVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 60, borderWidth: 1, borderColor: '#8884', borderRadius: 12, paddingHorizontal: 14 },
  name: { fontSize: 18, fontWeight: '600' },
  band: { fontSize: 15, opacity: 0.7 },
});
