import { router } from 'expo-router';
import { ConstellationMark } from '@/components/Brand';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Button, Card, Chip, useColors } from '@/components/ui';
import { api, type FeedEntry, type FeedPostResponse } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';

// AD11. Ranked feed from the ML server. Summaries and reply drafts are written there.
export default function FeedScreen() {
  const c = useColors();
  const feed = useAsync(() => api.feed(), []);
  const [mine, setMine] = useState<FeedEntry[]>([]);
  const [kind, setKind] = useState<'post' | 'update'>('update');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const publish = async () => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await api.createPost({ kind, body: text });
      setMine((prev) => [postedEntry(created), ...prev]);
      setBody('');
      setComposing(false);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  const remote = feed.state.status === 'ready' ? feed.state.data.items : [];
  const remoteIds = new Set(remote.flatMap(item => item.type === 'item' ? [item.item_id] : item.item_ids));
  const items = [...mine.filter(item => item.type !== 'item' || !remoteIds.has(item.item_id)), ...remote];

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={false} onRefresh={feed.reload} tintColor={c.tint} />}>
      <View style={{ gap: 4, paddingTop: 4 }}>
        <Text style={[styles.heading, { color: c.text }]}>Stay in the <Text style={{ color: c.tint }}>loop.</Text></Text>
        <Text style={[styles.lead, { color: c.muted }]}>The latest from people you know.</Text>
      </View>
      <Pressable onPress={() => setComposing(!composing)} accessibilityRole="button" accessibilityState={{ expanded: composing }}
        style={({ pressed }) => [styles.composePill, { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.composeText}>{body.trim() ? 'Continue your draft' : 'Share something with your circle'}</Text>
        <View style={styles.composePlus}><Text style={{ color: c.tint, fontSize: 20, fontWeight: '700', lineHeight: 22 }}>{composing ? '−' : '+'}</Text></View>
      </Pressable>
      {composing && <Card>
        <View style={styles.kinds}>
          {(['update', 'post'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setKind(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === option }}
              style={[styles.kind, { backgroundColor: kind === option ? c.tint : c.surfaceAlt }]}>
              <Text style={{ color: kind === option ? c.onTint : c.text, fontWeight: '700' }}>
                {option === 'update' ? 'Update' : 'Post'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={kind === 'update' ? 'What changed for you?' : 'Share something with your connections'}
          placeholderTextColor={c.muted}
          multiline
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]}
          accessibilityLabel="Feed post"
        />
        <Button label="Share" onPress={publish} loading={posting} disabled={!body.trim()} />
        {postError && <Text style={{ color: c.danger }}>{postError}</Text>}
      </Card>}

      {feed.state.status === 'loading' && <Loading label="Loading your feed…" />}
      {feed.state.status === 'error' && <ErrorState message={feed.state.message} onRetry={feed.reload} />}
      {feed.state.status === 'ready' && items.length === 0 && (
        <Card>
          <ConstellationMark size={48} /><Text style={[styles.title, { color: c.text }]}>Your constellation starts with a conversation.</Text>
          <Text style={[styles.body, { color: c.muted }]}>Posts and GitHub updates from your connections show up here.</Text><Button label="Discover your people" onPress={() => router.push('/discover')} />
        </Card>
      )}
      {items.map((item) => (
        <FeedCard key={item.type === 'item' ? `i-${item.item_id}` : `s-${item.author.user_id}-${item.created_at}`} item={item} />
      ))}
    </ScrollView>
  );
}

function postedEntry(created: FeedPostResponse): FeedEntry {
  return {
    type: 'item',
    item_id: created.item_id,
    author: { user_id: 'me', name: 'You', photo_url: null },
    kind: created.kind,
    title: created.title,
    body: created.body,
    url: created.url,
    created_at: created.created_at,
    score: 1,
    talked_about: [],
  };
}

function FeedCard({ item }: { item: FeedEntry }) {
  const c = useColors();
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = async (itemId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.replySuggestion(itemId);
      setReply(res.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const summary = item.type === 'summary';
  return (
    <Card style={summary ? { backgroundColor: c.tintSoft, borderColor: c.tintSoft } : undefined}>
      <View style={styles.row}>
        <Avatar name={item.author.name} photoUrl={item.author.photo_url} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{item.author.name}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>{item.type === 'summary' ? 'Weekly highlights' : item.kind === 'github' ? 'Building on GitHub' : 'Shared with connections'} · {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
        </View>
        {item.type === 'summary' && <AiBadge label="Summary" />}
      </View>
      {item.type === 'item' && !!item.title && <Text style={[styles.title, { color: c.text }]}>{item.title}</Text>}
      <Text style={[styles.body, { color: c.text }]}>{item.type === 'summary' ? item.summary : item.body}</Text>
      {item.type === 'item' && !!item.url && /^https?:\/\//i.test(item.url) && <Button label="Explore project" variant="secondary" onPress={() => { void Linking.openURL(item.url!).catch(() => setError('Could not open this link.')); }} />}
      {item.type === 'item' && item.talked_about.length > 0 && (
        <View style={styles.chips}>
          {item.talked_about.map((topic) => (
            <Chip key={topic} label={topic} tone="tint" />
          ))}
        </View>
      )}
      {item.type === 'item' && item.author.user_id !== 'me' && reply === null && (
        <Button label="Suggest a reply" variant="secondary" onPress={() => suggest(item.item_id)} loading={loading} />
      )}
      {reply !== null && (
        <>
          <Text style={[styles.meta, { color: c.muted }]}>Suggested reply. Edit it before you send it.</Text>
          <TextInput
            value={reply}
            onChangeText={setReply}
            multiline
            style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]}
            accessibilityLabel="Suggested reply"
          />
        </>
      )}
      {error && <Text style={{ color: c.danger }}>{error}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 18, paddingBottom: 100, width: '100%', maxWidth: 640, alignSelf: 'center' },
  heading: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  composePill: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 28, paddingLeft: 22, paddingRight: 8 },
  composeText: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  composePlus: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 15, lineHeight: 21 },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13 },
  body: { fontSize: 16, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
