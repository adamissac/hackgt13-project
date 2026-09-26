import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch } from 'react-native';

import { Empty, ErrorState, Loading } from '@/components/States';
import { Text, View, useThemeColor } from '@/components/Themed';
import { api, type Match } from '@/lib/api';
import { HACKGT_EVENT_ID } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';

// Open to Meet (MASTER_SPEC 3.3). Akshar owns the presence/location side; the shell only
// stores the toggle on the user's own profile row (RLS: owner can update).
function useOpenToMeet() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('profiles').select('open_to_meet').eq('id', auth.user.id).single();
      if (data) setOn(Boolean(data.open_to_meet));
    })().catch(() => {});
  }, []);

  const toggle = async (next: boolean) => {
    setOn(next);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return; // not signed in yet: keep it local
    const { error } = await supabase.from('profiles').update({ open_to_meet: next }).eq('id', auth.user.id);
    if (error) setOn(!next);
  };

  return [on, toggle] as const;
}

export default function HomeScreen() {
  const [openToMeet, setOpenToMeet] = useOpenToMeet();
  const { state, reload } = useAsync(() => api.matches(HACKGT_EVENT_ID), []);
  const tint = useThemeColor({}, 'tint');

  return (
    <View style={styles.container}>
      <View style={[styles.toggleCard, { borderColor: openToMeet ? tint : '#8884' }]}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleTitle}>Open to Meet</Text>
          <Text style={styles.muted}>
            {openToMeet ? 'People who match you can get a suggestion to meet.' : 'You are hidden from suggestions.'}
          </Text>
        </View>
        <Switch
          value={openToMeet}
          onValueChange={setOpenToMeet}
          accessibilityLabel="Open to Meet"
          style={styles.switch}
        />
      </View>

      <Text style={styles.section}>Your best matches at HackGT 13</Text>
      {state.status === 'loading' && <Loading label="Finding your matches…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.data.matches.length === 0 ? (
          <Empty title="No matches yet" body="Check in to the event and finish your profile to get matches." />
        ) : (
          <FlatList
            data={state.data.matches}
            keyExtractor={(m) => m.user_id}
            renderItem={({ item }) => <MatchRow match={item} />}
            contentContainerStyle={styles.list}
          />
        ))}
    </View>
  );
}

function MatchRow({ match }: { match: Match }) {
  const tint = useThemeColor({}, 'tint');
  return (
    <Pressable style={[styles.row, match.highlight && { borderColor: tint }]} accessibilityRole="button">
      <View style={styles.rowHeader}>
        <Text style={styles.name}>{match.name}</Text>
        <Text style={styles.muted}>{match.role === 'recruiter' ? 'Recruiter' : 'Student'}</Text>
      </View>
      <Text style={styles.why}>{match.why.join(' · ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 16, padding: 16, gap: 12 },
  toggleText: { flex: 1, gap: 4, backgroundColor: 'transparent' },
  toggleTitle: { fontSize: 22, fontWeight: '700' },
  switch: { transform: [{ scale: 1.3 }] },
  section: { fontSize: 18, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  list: { gap: 10, paddingBottom: 24 },
  row: { minHeight: 64, borderWidth: 1, borderColor: '#8884', borderRadius: 12, padding: 14, gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent' },
  name: { fontSize: 18, fontWeight: '600' },
  why: { fontSize: 15, opacity: 0.8 },
  muted: { fontSize: 14, opacity: 0.65 },
});
