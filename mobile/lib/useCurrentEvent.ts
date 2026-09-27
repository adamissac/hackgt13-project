import { useEffect, useState } from 'react';

import { getCurrentEventId, loadCurrentEvent, onCurrentEventChange } from './currentEvent';

export function useCurrentEventId(): number {
  const [id, setId] = useState(getCurrentEventId());
  useEffect(() => {
    loadCurrentEvent().then(setId);
    return onCurrentEventChange(setId);
  }, []);
  return id;
}
