import {
  requestBluetoothPermission,
  startAdvertising,
  stopAdvertising,
} from 'munim-bluetooth';

import { AK1_LOCAL_NAME_PREFIX, BLE_SERVICE_UUID } from './constants';
import { sessionDeviceSuffix } from './deviceId';

export const localName = `${AK1_LOCAL_NAME_PREFIX}${sessionDeviceSuffix}`;

export async function requestAdvertisePermission(): Promise<boolean> {
  return requestBluetoothPermission(['advertise']);
}

export function beginAdvertising(): void {
  startAdvertising({
    serviceUUIDs: [BLE_SERVICE_UUID],
    localName,
  });
}

export function endAdvertising(): void {
  stopAdvertising();
}
