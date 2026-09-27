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

/**
 * Resolves with the adapter state once it is PoweredOn, or with the last state after `timeoutMs`.
 * On iOS a new manager reports Unknown for a moment (and while the permission prompt is up); scanning
 * then fails with "BluetoothLE is in unknown state", so wait instead of racing it.
 */
export async function waitForPoweredOn(timeoutMs = 8_000): Promise<string> {
  const manager = getBleManager();
  if (!manager) throw new Error(BLE_UNAVAILABLE_MESSAGE);
  const now = await manager.state();
  if (now === 'PoweredOn') return now;
  return new Promise((resolve) => {
    let last: string = now;
    const sub = manager.onStateChange((state) => {
      last = state;
      if (state === 'PoweredOn') {
        clearTimeout(timer);
        sub.remove();
        resolve(state);
      }
    }, true);
    const timer = setTimeout(() => {
      sub.remove();
      resolve(last);
    }, timeoutMs);
  });
}

/** A sentence for a Bluetooth adapter state that isn't PoweredOn. */
export function bluetoothStateMessage(state: string): string {
  if (state === 'PoweredOff') return 'Bluetooth is off. Turn it on in Control Center, then try again.';
  if (state === 'Unauthorized') return 'Bluetooth permission was denied. Allow it in Settings → Constellation.';
  if (state === 'Unsupported') return 'This device does not support Bluetooth Low Energy.';
  return `Bluetooth is not ready yet (${state}). Try again in a moment.`;
}

export function stopScan(): void {
  getBleManager()?.stopDeviceScan();
}
