import { useEffect, useState } from 'react';

import { api } from './api';
import { onChange } from './changes';

export type OnboardingState = 'loading' | 'pending' | 'partial' | 'complete';

/** profiles.onboarding_status for the signed-in user; refreshes when the profile changes. */
export function useOnboarding(signedIn: boolean): OnboardingState {
  const [status, setStatus] = useState<OnboardingState>('loading');
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const load = () =>
      api
        .onboardingStatus()
        .then((s) => alive && setStatus(s))
        // Can't tell (offline, server down): don't trap the user in onboarding.
        .catch(() => alive && setStatus((prev) => (prev === 'loading' ? 'partial' : prev)));
    const first = setTimeout(load, 0);
    const off = onChange((topic) => topic === 'profile' && load());
    return () => {
      alive = false;
      clearTimeout(first);
      off();
    };
  }, [signedIn]);
  return signedIn ? status : 'loading';
}
