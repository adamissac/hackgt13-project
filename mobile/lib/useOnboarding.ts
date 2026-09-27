import { useEffect, useState } from 'react';

import { api } from './api';
import { emitChange, onChange } from './changes';

export type OnboardingState = 'loading' | 'pending' | 'partial' | 'complete';

// Onboarding stays open once shown until the person taps Continue / Skip for now. Without this, connecting
// GitHub built the profile, flipped the status to 'complete', and the app left onboarding before the resume step.
let open = false;
let dismissed = false;

/** Called by the onboarding screen's Continue / Skip for now. */
export function dismissOnboarding() {
  open = false;
  dismissed = true;
  emitChange('profile');
}

/**
 * Whether to show onboarding for the signed-in user: profiles.onboarding_status is 'pending', or (once per
 * sign-in) the account still has no resume or no GitHub. Refreshes when the profile changes.
 */
export function useOnboarding(signedIn: boolean): OnboardingState {
  const [status, setStatus] = useState<OnboardingState>('loading');
  useEffect(() => {
    if (!signedIn) {
      open = false;
      dismissed = false;
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const s = await api.onboardingStatus();
        if (open && !dismissed) return alive && setStatus('pending');
        if (s === 'pending' && !dismissed) {
          open = true;
          return alive && setStatus('pending');
        }
        if (!dismissed) {
          const acct = await api.accounts().catch(() => null);
          const missing = acct && (!acct.sources.github.connected || !acct.sources.resume.added);
          if (missing) {
            open = true;
            return alive && setStatus('pending');
          }
        }
        if (alive) setStatus(s);
      } catch {
        // Can't tell (offline, server down): don't trap the user in onboarding.
        if (alive) setStatus((prev) => (prev === 'loading' ? 'partial' : prev));
      }
    };
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
