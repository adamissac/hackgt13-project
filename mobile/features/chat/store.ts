import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import {
  latestByChat,
  toSummary,
  visibleChats,
  type ChatMessage,
  type ChatRow,
  type ChatSummary,
} from './model';

import { onChange } from '@/lib/changes';
import { demo, demoReady } from '@/lib/demo';
import { DEMO_ME } from '@/lib/demo/people';

/** Viewer id in demo mode, so the thread has a "me". */
export const MOCK_VIEWER_ID = DEMO_ME;

export interface ChatThread {
  id: number;
  other_user_id: string;
  other_name: string;
  messages: ChatMessage[];
}

function summaries(rows: ChatRow[], me: string, names: ReadonlyMap<string, string>, messages: ChatMessage[]): ChatSummary[] {
  const latest = latestByChat(messages);
  return visibleChats(rows, me)
    .map((row) => toSummary(row, me, names, latest.get(row.id) ?? null))
    .filter((row): row is ChatSummary => row !== null)
    .sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));
}

export async function listChats(me: string): Promise<ChatSummary[]> {
  if (env.useMocks) {
    await demoReady();
    return demo.listChats();
  }

  const { data, error } = await supabase.from('chats').select('id, user_a, user_b, origin, created_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = visibleChats((data ?? []) as ChatRow[], me);
  if (rows.length === 0) return [];

  const otherIds = rows.map((row) => (row.user_a === me ? row.user_b : row.user_a));
  const profiles = await supabase.from('profiles').select('id, name').in('id', otherIds);
  if (profiles.error) throw new Error(profiles.error.message);
  const names = new Map<string, string>();
  for (const profile of (profiles.data ?? []) as { id: string; name: string | null }[]) {
    if (profile.name) names.set(profile.id, profile.name);
  }

  const preview = await supabase
    .from('messages')
    .select('chat_id, body, created_at')
    .in('chat_id', rows.map((row) => row.id))
    .order('created_at', { ascending: false });
  if (preview.error) throw new Error(preview.error.message);

  return summaries(rows, me, names, (preview.data ?? []) as ChatMessage[]);
}

export async function loadThread(chatId: number, me: string): Promise<ChatThread> {
  if (env.useMocks) {
    await demoReady();
    return demo.loadThread(chatId);
  }

  const chat = await supabase.from('chats').select('id, user_a, user_b, origin, created_at').eq('id', chatId).maybeSingle();
  if (chat.error) throw new Error(chat.error.message);
  const row = chat.data as ChatRow | null;
  if (!row || !visibleChats([row], me).length) throw new Error('This chat is not available');

  const otherId = row.user_a === me ? row.user_b : row.user_a;
  const profile = await supabase.from('profiles').select('name').eq('id', otherId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);

  const messages = await supabase
    .from('messages')
    .select('id, chat_id, sender_id, body, is_ai_draft, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (messages.error) throw new Error(messages.error.message);

  return {
    id: chatId,
    other_user_id: otherId,
    other_name: (profile.data as { name: string | null } | null)?.name || 'Someone',
    messages: (messages.data ?? []) as ChatMessage[],
  };
}

export async function sendMessage(chatId: number, me: string, body: string, isAiDraft: boolean): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new Error('Write a message first');

  if (env.useMocks) {
    await demoReady();
    return demo.sendMessage(chatId, text, isAiDraft);
  }

  const inserted = await supabase
    .from('messages')
    .insert({ chat_id: chatId, sender_id: me, body: text, is_ai_draft: isAiDraft })
    .select('id, chat_id, sender_id, body, is_ai_draft, created_at')
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data as ChatMessage;
}

/** Live inserts for this chat. RLS still hides every other chat. Returns an unsubscribe. */
export function subscribeToMessages(chatId: number, onInsert: (message: ChatMessage) => void): () => void {
  if (env.useMocks) {
    // Demo replies arrive through the change bus; hand over only messages we haven't seen.
    const seen = new Set<number>();
    return onChange((topic) => {
      if (topic !== 'chats') return;
      for (const m of demo.loadThread(chatId).messages) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        onInsert(m);
      }
    });
  }
  const channel = supabase
    .channel(`chat:${chatId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => {
        const row = payload.new as ChatMessage;
        if (row && row.chat_id === chatId) onInsert(row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
