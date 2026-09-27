import { api, type CompanyEventStudio, type CompanyOrg } from './api';
import { useAsync } from './useAsync';

export function useOrg(enabled = true) {
  const { state, reload, refresh } = useAsync(
    () => (enabled ? api.myOrg() : Promise.resolve({ account: 'person' as const, org: null, events: [] })),
    [enabled],
    ['profile'],
  );
  const ready = state.status === 'ready' ? state.data : null;
  return {
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    account: ready?.account ?? 'person',
    isCompany: ready?.account === 'company',
    org: (ready?.org ?? null) as CompanyOrg | null,
    events: (ready?.events ?? []) as CompanyEventStudio[],
    reload,
    refresh,
  };
}
