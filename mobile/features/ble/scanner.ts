import { PermissionsAndroid, Platform } from 'react-native';

import { BLE_SERVICE_UUID } from './constants';
import { BLE_UNAVAILABLE_MESSAGE, getBleManager } from './native';

export async function requestScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // iOS asks for NSBluetoothAlwaysUsageDescription automatically on first scan.
    return true;
  }
  if (Number(Platform.Version) < 31) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return (
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
    granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
  );
}

export type DiscoveredPeer = {
  id: string;
  localName: string | null;
  rssi: number | null;
  lastSeenAt: number;
};

/** One long-running scan filtered by our service UUID (Android throttles >5 scan starts per 30 s,
 *  so never restart this in a loop). Throws when Bluetooth isn't in this build. */
export function startScan(onPeerSeen: (peer: DiscoveredPeer) => void, onError?: (message: string) => void): void {
  const manager = getBleManager();
  if (!manager) throw new Error(BLE_UNAVAILABLE_MESSAGE);
  manager.startDeviceScan([BLE_SERVICE_UUID], { allowDuplicates: true }, (error, device) => {
    if (error) {
      console.warn('[ble] scan error', error);
      onError?.(error.message);
      return;
    }
    if (!device) return;
    onPeerSeen({
      id: device.id,
      localName: device.localName ?? device.name,
      rssi: device.rssi,
      lastSeenAt: Date.now(),
    });
  });
}

export function stopScan(): void {
  getBleManager()?.stopDeviceScan();
}
