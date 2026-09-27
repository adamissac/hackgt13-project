import { router } from 'expo-router';
import { ConstellationMark } from '@/components/Brand';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { ErrorState, Loading } from '@/components/States';
import { AiBadge, Avatar, Button, Card, Chip, firstName, useColors } from '@/components/ui';
import { api, type FeedEntry, type FeedItemEntry, type FeedPostResponse } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { useAsync } from '@/lib/useAsync';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useAuth } from '@/lib/auth';
import { DEMO_ME } from '@/lib/demo/people';
import { otherPeopleFeed } from '@/features/feed/visibility';

// AD11. Ranked feed from the ML server. Summaries and reply drafts are written there.
export default function FeedScreen() {
  const c = useColors();
  const { session, guest } = useAuth();
  const viewer = guest ? DEMO_ME : session?.user.id;
  // The feed is always your connections' posts, in or out of an event.
  const feed = useAsync(() => api.feed(), [viewer]);
  useLiveRefresh(feed.refresh, 5000);
  // Your own posts, so you can edit or delete them (the feed itself shows other people).
  const mine = useAsync(() => api.myPosts(), [viewer]);
  const [showMine, setShowMine] = useState(false);
  const [published, setPublished] = useState(false);
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
      await api.createPost({ kind, body: text });
      mine.reload();
      setPublished(true);
      setBody('');
      setComposing(false);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  const remote = feed.state.status === 'ready' ? feed.state.data.items : [];
  const items = otherPeopleFeed(remote, viewer);

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
      {published && <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 13 }}>Shared with your connections. You can edit or delete it under Your posts.</Text>}
      {mine.state.status === 'ready' && mine.state.data.items.length > 0 && (
        <Card>
          <Pressable onPress={() => setShowMine((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showMine }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <Text style={[styles.title, { color: c.text }]}>Your posts <Text style={{ color: c.muted, fontWeight: '400' }}>{mine.state.data.items.length}</Text></Text>
            <Text style={{ color: c.tint, fontWeight: '700' }}>{showMine ? 'Hide' : 'Manage'}</Text>
          </Pressable>
          {showMine && mine.state.data.items.map((post) => <MyPost key={post.item_id} post={post} onChanged={mine.reload} />)}
        </Card>
      )}
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

function FeedCard({ item }: { item: FeedEntry }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const date = new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

  if (item.type === 'summary') {
    const parts = item.items ?? [];
    return (
      <Card style={{ backgroundColor: c.tintSoft, borderColor: c.tintSoft }}>
        <View style={styles.row}>
          <Avatar name={item.author.name} photoUrl={item.author.photo_url} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.text }]}>{item.author.name}</Text>
            <Text style={[styles.meta, { color: c.muted }]}>Highlights · {date}</Text>
          </View>
          <AiBadge label="Summary" />
        </View>
        <Text style={[styles.body, { color: c.text }]}>{item.summary}</Text>
        {parts.length > 0 && (
          <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
            style={({ pressed }) => [styles.expand, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: c.tint, fontWeight: '700', fontSize: 15 }}>
              {open ? 'Hide the updates' : `See all ${parts.length} updates`}
            </Text>
          </Pressable>
        )}
        {open && parts.map((part) => (
          <View key={part.item_id} style={[styles.nested, { backgroundColor: c.surface }]}>
            <ItemContent item={part} />
          </View>
        ))}
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.row}>
        <Avatar name={item.author.name} photoUrl={item.author.photo_url} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{item.author.name}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>{item.kind === 'github' ? 'Building on GitHub' : 'Shared with connections'} · {date}</Text>
        </View>
        {item.details?.ai && <AiBadge label="AI brief" />}
      </View>
      <ItemContent item={item} />
    </Card>
  );
}

// One item's content. GitHub items with a brief show what they built: summary, highlights, stack, and a
// question to ask them next time. Also used inside an expanded summary card.
function ItemContent({ item }: { item: FeedItemEntry }) {
  const c = useColors();
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brief = item.details ?? null;
  const title = item.kind === 'github' && item.title ? item.title.charAt(0).toUpperCase() + item.title.slice(1) : item.title;

  const suggest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.replySuggestion(item.item_id);
      setReply(res.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {!!title && <Text style={[styles.title, { color: c.text }]}>{title}</Text>}
      {brief ? (
        <>
          <Text style={[styles.body, { color: c.text }]}>{brief.summary}</Text>
          {brief.highlights.length > 0 && (
            <View style={{ gap: 8 }} accessibilityLabel="Highlights">
              {brief.highlights.map((line) => (
                <View key={line} style={styles.bullet}>
                  <View style={[styles.dot, { backgroundColor: c.tint }]} />
                  <Text style={[styles.bulletText, { color: c.text }]}>{line}</Text>
                </View>
              ))}
            </View>
          )}
          {brief.stack.length > 0 && (
            <View style={styles.chips}>
              {brief.stack.map((name) => <Chip key={name} label={name} />)}
            </View>
          )}
          {!!brief.ask && (
            <View style={[styles.ask, { backgroundColor: c.aiSoft }]}>
              <View style={styles.askLabel}>
                <AppIcon name="chat" color={c.ai} size={15} />
                <Text style={{ color: c.ai, fontWeight: '700', fontSize: 13 }}>Ask {firstName(item.author.name)} next time</Text>
              </View>
              <Text style={[styles.bulletText, { color: c.text }]}>{brief.ask}</Text>
            </View>
          )}
        </>
      ) : (
        !!item.body && <Text style={[styles.body, { color: c.text }]}>{item.body}</Text>
      )}
      {item.talked_about.length > 0 && (
        <View style={styles.chips}>
          {item.talked_about.map((topic) => (
            <Chip key={topic} label={topic} tone="tint" />
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {!!item.url && /^https?:\/\//i.test(item.url) && <Button label={item.kind === 'github' ? 'Explore project' : 'Open link'} variant="secondary" style={styles.action} onPress={() => { void Linking.openURL(item.url!).catch(() => setError('Could not open this link.')); }} />}
        {item.author.user_id !== 'me' && reply === null && (
          <Button label="Suggest a reply" variant="secondary" style={styles.action} onPress={suggest} loading={loading} />
        )}
      </View>
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
    </View>
  );
}

// One of your own posts: edit it in place, or delete it (with a confirm).
function MyPost({ post, onChanged }: { post: FeedPostResponse; onChanged: () => void }) {
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.body);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy('save');
    setError(null);
    try {
      await api.editPost(post.item_id, { body: text.trim(), title: post.title });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (busy || !(await confirmAction('Delete this post?', 'It disappears from your connections’ feeds. This can’t be undone.', 'Delete'))) return;
    setBusy('delete');
    setError(null);
    try {
      await api.deletePost(post.item_id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <View style={[styles.myPost, { borderTopColor: c.border }]}>
      <Text style={[styles.meta, { color: c.muted }]}>
        {post.kind === 'update' ? 'Update' : 'Post'} · {new Date(post.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </Text>
      {editing ? (
        <TextInput value={text} onChangeText={setText} multiline autoFocus accessibilityLabel="Edit post"
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt }]} />
      ) : (
        <Text style={[styles.body, { color: c.text }]}>{post.body}</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {editing ? (
          <>
            <Button label="Save" onPress={() => void save()} loading={busy === 'save'} disabled={!text.trim() || text.trim() === post.body} style={{ flex: 1 }} />
            <Button label="Cancel" variant="ghost" onPress={() => { setEditing(false); setText(post.body); }} style={{ flex: 1 }} />
          </>
        ) : (
          <>
            <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} style={{ flex: 1 }} />
            <Button label="Delete" variant="ghost" onPress={() => void remove()} loading={busy === 'delete'} style={{ flex: 1 }} />
          </>
        )}
      </View>
      {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  myPost: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 8 },
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
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 21 },
  ask: { borderRadius: 14, padding: 14, gap: 6 },
  askLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expand: { minHeight: 44, justifyContent: 'center' },
  nested: { borderRadius: 16, padding: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 140 },
});
