import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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

  const publish = async () => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await api.createPost({ kind, body: text });
      setMine((prev) => [postedEntry(created), ...prev]);
      setBody('');
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  const items = [...mine, ...(feed.state.status === 'ready' ? feed.state.data.items : [])];

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.lead, { color: c.muted }]}>Updates from people you’ve connected with. Only you see this.</Text>
      <Card>
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
      </Card>

      {feed.state.status === 'loading' && <Loading label="Loading your feed…" />}
      {feed.state.status === 'error' && <ErrorState message={feed.state.message} onRetry={feed.reload} />}
      {feed.state.status === 'ready' && items.length === 0 && (
        <Card>
          <Text style={[styles.title, { color: c.text }]}>Nothing here yet</Text>
          <Text style={[styles.body, { color: c.muted }]}>Posts and GitHub updates from your connections show up here.</Text>
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

  return (
    <Card>
      <View style={styles.row}>
        <Avatar name={item.author.name} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{item.author.name}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>{item.type === 'summary' ? 'Several updates' : item.kind}</Text>
        </View>
        {item.type === 'summary' && <AiBadge label="Summary" />}
      </View>
      {item.type === 'item' && !!item.title && <Text style={[styles.title, { color: c.text }]}>{item.title}</Text>}
      <Text style={[styles.body, { color: c.text }]}>{item.type === 'summary' ? item.summary : item.body}</Text>
      {item.type === 'item' && item.talked_about.length > 0 && (
        <View style={styles.chips}>
          {item.talked_about.map((topic) => (
            <Chip key={topic} label={topic} />
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
  container: { padding: 16, gap: 12, paddingBottom: 40 },
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
