// Rotating advertising tokens (MASTER_SPEC 7.1). The server issues a 24 h batch, one token per
// 10-minute window; the phone advertises whichever token covers "now".
import { api, type BleToken } from '@/lib/api';
import { env } from '@/lib/env';

export const TOKEN_RE = /^[a-z2-7]{8}$/;
const WINDOW_MS = 10 * 60_000;
const REFRESH_WHEN_LEFT_MS = 2 * 60 * 60_000; // refetch when less than 2 h of tokens remain

interface Window {
  token: string;
  from: number;
  to: number;
}

let batch: Window[] = [];

function toWindows(tokens: BleToken[]): Window[] {
  return tokens
    .map((t) => ({ token: t.token, from: Date.parse(t.valid_from), to: Date.parse(t.valid_to) }))
    .sort((a, b) => a.from - b.from);
}

// Mock mode has no server, so make random tokens locally (same shape, not registered anywhere).
function localBatch(now: number): Window[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return Array.from({ length: 144 }, (_, i) => ({
    token: Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * 32)]).join(''),
    from: start + i * WINDOW_MS,
    to: start + (i + 1) * WINDOW_MS,
  }));
}

/** Makes sure we hold tokens for now and the next couple of hours. */
export async function ensureTokens(now = Date.now()): Promise<void> {
  const last = batch[batch.length - 1];
  if (last && last.to - now > REFRESH_WHEN_LEFT_MS && batch[0].from <= now) return;
  batch = env.useMocks ? localBatch(now) : toWindows((await api.bleTokens()).tokens);
}

export function currentToken(now = Date.now()): string | null {
  return batch.find((w) => w.from <= now && now < w.to)?.token ?? null;
}

/** Milliseconds until the advertised token should change. */
export function msUntilRotation(now = Date.now()): number {
  const w = batch.find((x) => x.from <= now && now < x.to);
  return w ? w.to - now : 0;
}

/** Our own tokens, so we never record ourselves. */
export function isOwnToken(token: string): boolean {
  return batch.some((w) => w.token === token);
}
