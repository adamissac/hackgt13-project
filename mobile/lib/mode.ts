// Live vs demo, chosen at runtime. Demo mode runs the whole product loop against a local
// simulated backend (lib/demo) so it can be shown without a second phone or Bluetooth.
// EXPO_PUBLIC_USE_MOCKS=1 only sets the starting value; "Try the demo" on sign-in turns it on.

let demo = process.env.EXPO_PUBLIC_USE_MOCKS === '1';
const listeners = new Set<(on: boolean) => void>();

export const isDemo = () => demo;

export function setDemo(on: boolean) {
  if (demo === on) return;
  demo = on;
  listeners.forEach((l) => l(on));
}

export function onDemoChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
