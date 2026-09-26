// Tiny change bus: "something about X changed, refetch". Demo mode emits it when the simulated
// other person acts; live mode emits it after local writes. Screens listen with useChanges.
export type ChangeTopic = 'relationships' | 'chats' | 'notifications' | 'connections' | 'profile' | 'meetups';

type Listener = (topic: ChangeTopic) => void;
const listeners = new Set<Listener>();

export function emitChange(...topics: ChangeTopic[]) {
  for (const topic of topics) listeners.forEach((l) => l(topic));
}

export function onChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
