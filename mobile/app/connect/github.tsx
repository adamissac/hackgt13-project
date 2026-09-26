import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { Loading } from '@/components/States';
import { parseGithubReturn } from '@/lib/accounts';

// formalconnect://connect/github?status=... normally returns into the in-app browser session
// (lib/accounts.ts). If the OS opens the app with it instead (some Android browsers), land here.
export default function GithubReturn() {
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (!url) return;
    const r = parseGithubReturn(url);
    if (typeof r === 'object') Alert.alert('GitHub', r.error);
    router.replace('/accounts');
  }, [url]);

  return <Loading label="Finishing GitHub connect…" />;
}
