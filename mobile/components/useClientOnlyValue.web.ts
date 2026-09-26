import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

// Keep server and hydration output identical, then use the browser value.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? client : server;
}
