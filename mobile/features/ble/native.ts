// Lazy access to the Bluetooth native modules. Expo Go doesn't include them, and requiring them
// there throws, so nothing in the app imports them at module load. Screens call `bleAvailable()`
// and show "needs the dev build" instead of crashing.
import Constants, { ExecutionEnvironment } from 'expo-constants';

type BlePlx = typeof import('react-native-ble-plx');
type Munim = typeof import('munim-bluetooth');

export const BLE_UNAVAILABLE_MESSAGE =
  'Bluetooth needs the development build (Expo Go does not include it). Run `npx expo run:ios --device` or an EAS dev build.';

let plx: BlePlx | null | undefined;
let munim: Munim | null | undefined;
let manager: InstanceType<BlePlx['BleManager']> | null = null;

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/* eslint-disable @typescript-eslint/no-require-imports */
function loadPlx(): BlePlx | null {
  if (plx === undefined) {
    try {
      plx = inExpoGo ? null : (require('react-native-ble-plx') as BlePlx);
    } catch {
      plx = null;
    }
  }
  return plx;
}

export function loadMunim(): Munim | null {
  if (munim === undefined) {
    try {
      munim = inExpoGo ? null : (require('munim-bluetooth') as Munim);
    } catch {
      munim = null;
    }
  }
  return munim;
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** The single BleManager for the app, or null when the native module is missing. */
export function getBleManager() {
  if (manager) return manager;
  const mod = loadPlx();
  if (!mod) return null;
  try {
    manager = new mod.BleManager();
  } catch {
    plx = null;
    return null;
  }
  return manager;
}

export function bleAvailable(): boolean {
  return getBleManager() !== null && loadMunim() !== null;
}
