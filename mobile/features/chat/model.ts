// Chat helpers with no React or network. The server (RLS) is the real gate;
// these keep the client from rendering a chat the viewer is not in.

export interface ChatRow {
  id: number;
  user_a: string;
  user_b: string;
  origin: 'suggestion' | 'connection';
  created_at: string;
}

export interface ChatMessage {
  id: number;
  chat_id: number;
  sender_id: string;
  body: string;
  is_ai_draft: boolean;
  created_at: string;
}

export interface ChatSummary {
  id: number;
  other_user_id: string;
  other_name: string;
  origin: 'suggestion' | 'connection';
  last_body: string | null;
  last_at: string | null;
}

/** The other person in a chat, or null when `me` is not a participant. */
export function otherParticipant(row: { user_a: string; user_b: string }, me: string): string | null {
  if (row.user_a === me) return row.user_b;
  if (row.user_b === me) return row.user_a;
  return null;
}

/** Drop any row the viewer is not in. Never attaches a connection count. */
export function visibleChats(rows: ChatRow[], me: string): ChatRow[] {
  return rows.filter((row) => otherParticipant(row, me) !== null);
}

export function toSummary(
  row: ChatRow,
  me: string,
  names: ReadonlyMap<string, string>,
  latest: { body: string; created_at: string } | null,
): ChatSummary | null {
  const other = otherParticipant(row, me);
  if (!other) return null;
  return {
    id: row.id,
    other_user_id: other,
    other_name: names.get(other) || 'Someone',
    origin: row.origin,
    last_body: latest?.body ?? null,
    last_at: latest?.created_at ?? null,
  };
}

/** Newest message per chat. Input order does not matter. */
export function latestByChat(messages: Pick<ChatMessage, 'chat_id' | 'body' | 'created_at'>[]): Map<number, { body: string; created_at: string }> {
  const out = new Map<number, { body: string; created_at: string }>();
  for (const message of messages) {
    const prev = out.get(message.chat_id);
    if (!prev || message.created_at > prev.created_at) {
      out.set(message.chat_id, { body: message.body, created_at: message.created_at });
    }
  }
  return out;
}

/** Append a realtime or send result. Same id is ignored so a send plus its echo stays one bubble. */
export function appendMessage(existing: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (existing.some((message) => message.id === incoming.id)) return existing;
  return [...existing, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}

/** The icebreaker is an AI draft only when the user sends the suggestion unchanged. */
export function isSuggestedOpener(body: string, opener: string | null): boolean {
  if (!opener) return false;
  return body.trim() === opener.trim() && body.trim().length > 0;
}
