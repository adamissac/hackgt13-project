import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useLiveRefresh } from '@/lib/useLiveRefresh';

/** Only the focused header polls; hidden tab headers don't keep making requests. */
export function useUnreadCount(): number {
  const { state, refresh } = useAsync(() => api.notifications(), [], ['notifications']);
  useLiveRefresh(refresh, 5000);
  return state.status === 'ready' ? state.data.filter(n => !n.read).length : 0;
}
