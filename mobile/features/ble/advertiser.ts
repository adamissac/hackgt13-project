import { AK1_LOCAL_NAME_PREFIX, BLE_SERVICE_UUID } from './constants';
import { sessionDeviceSuffix } from './deviceId';
import { BLE_UNAVAILABLE_MESSAGE, loadMunim } from './native';

// AK1 hello-world / AK6 recording name. AK2's engine advertises the rotating server token instead.
export const localName = `${AK1_LOCAL_NAME_PREFIX}${sessionDeviceSuffix}`;

export async function requestAdvertisePermission(): Promise<boolean> {
  const munim = loadMunim();
  if (!munim) return false;
  return munim.requestBluetoothPermission(['advertise']);
}

/** Advertise our service UUID with `name` as the local name (iOS can't carry service data). */
export function beginAdvertising(name: string = localName): void {
  const munim = loadMunim();
  if (!munim) throw new Error(BLE_UNAVAILABLE_MESSAGE);
  munim.startAdvertising({ serviceUUIDs: [BLE_SERVICE_UUID], localName: name });
}

export function endAdvertising(): void {
  loadMunim()?.stopAdvertising();
}
