import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { ErrorState, Loading } from '@/components/States';
import { completeAuthFromUrl } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Magic links (and LinkedIn when it hands off to its own app) open .../auth/callback?code=...; exchange it once.
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    completeAuthFromUrl(url)
      .then(() => alive && router.replace('/'))
      .catch(async (e: unknown) => {
        if (!alive) return;
        // Signed in anyway (the other path exchanged the code): carry on.
        const { data } = await supabase.auth.getSession();
        if (data.session) router.replace('/');
        else setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (error) return <ErrorState message={error} onRetry={() => router.replace('/sign-in')} />;
  return <Loading label="Signing you in…" />;
}
