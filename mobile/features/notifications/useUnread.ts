import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { onChange } from '@/lib/changes';

/** Unread in-app notifications, for the bell badge. Refreshes on change and every 30 s. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .notifications()
        .then((n) => alive && setCount(n.filter((x) => !x.read).length))
        .catch(() => undefined);
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    const off = onChange((topic) => topic === 'notifications' && load());
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
      off();
    };
  }, []);
  return count;
}
