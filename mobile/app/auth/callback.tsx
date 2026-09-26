import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { ErrorState, Loading } from '@/components/States';
import { completeAuthFromUrl } from '@/lib/auth';

// Magic links open formalconnect://auth/callback?code=...; exchange the code for a session.
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    completeAuthFromUrl(url)
      .then(() => router.replace('/'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [url]);

  if (error) return <ErrorState message={error} onRetry={() => router.replace('/sign-in')} />;
  return <Loading label="Signing you in…" />;
}
