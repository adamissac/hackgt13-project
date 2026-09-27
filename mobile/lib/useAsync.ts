import { useCallback, useEffect, useRef, useState } from 'react';

import { onChange, type ChangeTopic } from './changes';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/**
 * Runs `fn` on mount and whenever `deps` change; `reload` runs it again. Drives loading, empty,
 * and error states. `reloadOn` refetches quietly (no loading flash) when those topics change.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], reloadOn: ChangeTopic[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const fnRef = useRef(fn);
  const run = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const key = JSON.stringify(deps);
  const topics = reloadOn.join(',');

  useEffect(() => {
    fnRef.current = fn;
  });

  const load = useCallback((quiet: boolean) => {
    if (pending.current) return pending.current;
    const mine = ++run.current;
    if (!quiet) setState({ status: 'loading' });
    const task = Promise.resolve().then(() => fnRef.current())
      .then((data) => { if (mine === run.current) setState({ status: 'ready', data }); })
      .catch((e: unknown) => {
        if (mine !== run.current) return;
        const message = e instanceof Error ? e.message : String(e);
        // A quiet refresh that fails keeps showing the last good data.
        setState((prev) => (quiet && prev.status === 'ready' ? prev : { status: 'error', message }));
      }).finally(() => { if (pending.current === task) pending.current = null; });
    pending.current = task;
    return task;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(false), 0);
    const counter = run;
    return () => {
      clearTimeout(t);
      counter.current++; // drop results of a run that finishes after deps changed
      pending.current = null;
    };
  }, [key, load]);

  useEffect(() => {
    if (!topics) return;
    const wanted = topics.split(',');
    return onChange((topic) => wanted.includes(topic) && load(true));
  }, [topics, load]);

  // Keep useful content visible for retries/refreshes; only new dependencies
  // replace the screen with its initial loading state.
  const reload = useCallback(() => load(true), [load]);
  const refresh = useCallback(() => load(true), [load]);
  return { state, reload, refresh };
}
