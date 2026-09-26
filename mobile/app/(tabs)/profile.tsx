import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { Empty, ErrorState, Loading } from '@/components/States';
import { Text, View } from '@/components/Themed';
import { api } from '@/lib/api';
import { env, missingEnv } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

// Profile: sign-in status and the AI-extracted interests. Sign-in UI lands in AD2,
// interest confirm/hide/add in AD5.
export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const { state, reload } = useAsync(() => api.getInterests(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {missingEnv.length > 0 && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>Missing config: {missingEnv.join(', ')}. See mobile/.env.example.</Text>
        </View>
      )}
      <Text style={styles.muted}>
        {session ? `Signed in as ${session.user.email ?? session.user.id}` : 'Not signed in'}
        {env.useMocks ? ' · mock data' : ''}
      </Text>

      <Text style={styles.section}>Your interests</Text>
      {state.status === 'loading' && <Loading label="Loading your interests…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.data.interests.filter((i) => !i.hidden).length === 0 ? (
          <Empty title="No interests yet" body="Upload a resume or connect GitHub to build your profile." />
        ) : (
          state.data.interests
            .filter((i) => !i.hidden)
            .map((i) => (
              <View key={i.interest_id} style={styles.row}>
                <Text style={styles.name}>
                  {i.name}
                  {i.confirmed ? ' ✓' : ''}
                </Text>
                <Text style={styles.muted}>{i.evidence}</Text>
              </View>
            ))
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, flexGrow: 1 },
  warning: { backgroundColor: '#f5a62333', borderRadius: 10, padding: 12 },
  warningText: { fontSize: 15 },
  section: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  row: { borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 14, gap: 4 },
  name: { fontSize: 17, fontWeight: '600' },
  muted: { fontSize: 14, opacity: 0.65 },
});
