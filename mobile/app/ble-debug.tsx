import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import {
  beginAdvertising,
  endAdvertising,
  localName,
  requestAdvertisePermission,
} from '@/features/ble/advertiser';
import {
  type DiscoveredPeer,
  requestScanPermission,
  startScan,
  stopScan,
} from '@/features/ble/scanner';
import { BLE_UNAVAILABLE_MESSAGE, bleAvailable } from '@/features/ble/native';

// AK1: Bluetooth hello world. Done when two physical phones running this
// screen see each other's localName and RSSI. See PROGRESS.md and
// MASTER_SPEC.md 7.1-7.3 for the full proximity design this leads into.
export default function BleHelloWorld() {
  const [isRunning, setIsRunning] = useState(false);
  const [peers, setPeers] = useState<Record<string, DiscoveredPeer>>({});
  const [status, setStatus] = useState('Idle');
  const runningRef = useRef(false);

  const handlePeerSeen = useCallback((peer: DiscoveredPeer) => {
    setPeers((prev) => ({ ...prev, [peer.id]: peer }));
  }, []);

  const start = useCallback(async () => {
    if (!bleAvailable()) {
      setStatus(BLE_UNAVAILABLE_MESSAGE);
      return;
    }
    setStatus('Requesting permissions...');
    const [scanOk, advertiseOk] = await Promise.all([
      requestScanPermission(),
      requestAdvertisePermission(),
    ]);
    if (!scanOk || !advertiseOk) {
      setStatus('Bluetooth permission denied');
      return;
    }
    startScan(handlePeerSeen);
    beginAdvertising();
    runningRef.current = true;
    setIsRunning(true);
    setStatus(`Advertising as "${localName}" and scanning...`);
  }, [handlePeerSeen]);

  const stop = useCallback(() => {
    stopScan();
    endAdvertising();
    runningRef.current = false;
    setIsRunning(false);
    setStatus('Idle');
  }, []);

  useEffect(() => {
    return () => {
      if (runningRef.current) {
        stopScan();
        endAdvertising();
      }
    };
  }, []);

  const peerList = Object.values(peers).sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AK1: BLE Hello World</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.localName}>My local name: {localName}</Text>
      <View style={styles.buttonRow}>
        <Button title={isRunning ? 'Stop' : 'Start'} onPress={isRunning ? stop : start} />
      </View>
      <Text style={styles.sectionHeader}>Nearby peers ({peerList.length})</Text>
      <FlatList
        data={peerList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.peerRow}>
            <Text style={styles.peerName}>{item.localName ?? '(no name)'}</Text>
            <Text style={styles.peerRssi}>{item.rssi ?? '?'} dBm</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No peers yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  status: { marginTop: 8, color: '#555' },
  localName: { marginTop: 4, fontFamily: 'Menlo', fontSize: 13 },
  buttonRow: { marginVertical: 16 },
  sectionHeader: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  peerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  peerName: { fontSize: 15 },
  peerRssi: { fontSize: 15, color: '#888' },
  empty: { color: '#888', fontStyle: 'italic' },
});
