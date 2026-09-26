import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** Runs `fn` on mount; `reload` runs it again. Drives loading, empty, and error states. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    run()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(reload, [reload]);
  return { state, reload };
}
