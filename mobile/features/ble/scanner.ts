import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, type Device } from 'react-native-ble-plx';

import { BLE_SERVICE_UUID } from './constants';

export const bleManager = new BleManager();

export async function requestScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // iOS asks for NSBluetoothAlwaysUsageDescription automatically on first scan.
    return true;
  }
  if (Number(Platform.Version) < 31) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
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

export function startScan(onPeerSeen: (peer: DiscoveredPeer) => void): void {
  bleManager.startDeviceScan([BLE_SERVICE_UUID], { allowDuplicates: true }, (error, device: Device | null) => {
    if (error) {
      console.warn('[ble] scan error', error);
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
  bleManager.stopDeviceScan();
}
