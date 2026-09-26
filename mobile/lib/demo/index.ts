// Loads and saves demo state on the phone so a reload keeps the demo where it was.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hydrate, onSave } from './backend';

const KEY = 'fc.demo-state.v1';
let ready: Promise<void> | null = null;

export function demoReady(): Promise<void> {
  ready ??= AsyncStorage.getItem(KEY)
    .then((json) => hydrate(json))
    .catch(() => undefined)
    .then(() => onSave((json) => void AsyncStorage.setItem(KEY, json).catch(() => undefined)));
  return ready;
}

export * as demo from './backend';
export { demoAssistantReply } from './assistant';
