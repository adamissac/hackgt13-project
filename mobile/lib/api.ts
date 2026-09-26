// Typed client for the FastAPI service. Shapes are hand-written from docs/api.md;
// keep them in sync (contract-keeper checks this). With EXPO_PUBLIC_USE_MOCKS=1 every call
// resolves with the matching file in docs/mocks/ instead of hitting the network.

import { env } from './env';
import { supabase } from './supabase';

// ---------- types (docs/api.md) ----------
export type Facet = 'technical' | 'career' | 'personal' | 'academic';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type Proximity = 'immediate' | 'near' | 'far' | null;

export interface IngestResponse { job_id: string; status: JobStatus }
export interface StatusResponse { job_id: string; status: JobStatus; error: string | null }
export type ManualIngest = { source: 'manual'; text: string; seeking?: string; offering?: string };
export type LinkedIngest = { source: 'github' | 'facebook' };

export interface Interest {
  interest_id: number;
  name: string;
  facet: Facet;
  weight: number;
  source: string;
  evidence: string;
  confirmed: boolean;
  hidden: boolean;
}
export interface InterestsResponse { user_id: string; seeking: string; offering: string; interests: Interest[] }
export interface InterestsPatch { confirm?: number[]; hide?: number[]; add?: { name: string; facet: Facet }[] }

export interface Match {
  user_id: string;
  name: string;
  photo_url: string | null;
  role: 'student' | 'recruiter';
  score: number;
  rank: number;
  highlight: boolean;
  why: string[];
  proximity: Proximity;
}
export interface MatchesResponse { event_id: number; model: string; matches: Match[] }
export interface StartersResponse { why: string; openers: string[] }

export interface QrToken { payload: string; signature: string; expires_at: string }
export interface Person { user_id: string; name: string; photo_url: string | null }
export interface HandshakeResponse {
  handshake_id: number;
  other: Person;
  checklist: { interest_id: number; name: string }[];
}
export interface FeedbackRequest { handshake_id: number; talked_about: number[]; other_topic: string; wants_connect: boolean }
// "no_connection" never says who declined.
export type FeedbackResponse =
  | { status: 'waiting' }
  | { status: 'connected'; connection: { user_id: string; name: string } }
  | { status: 'no_connection' };

export interface Connection {
  user_id: string;
  name: string;
  photo_url: string | null;
  met_at: string;
  created_at: string;
  talked_about: string[];
  minutes_talked: number;
}
export interface ConnectionsResponse { connections: Connection[] }

// Private invites (section 15). The token appears only inside `url`, returned once.
export type InviteChannel = 'link' | 'qr' | 'contact';
export type InviteStatus = 'active' | 'accepted' | 'revoked' | 'expired';
export interface CreateInviteRequest { channel?: InviteChannel; recipient_hint?: string; note?: string }
export interface CreateInviteResponse { invite_id: number; url: string; qr_payload: string; expires_at: string }
export interface MyInvite {
  invite_id: number;
  channel: InviteChannel;
  recipient_hint: string | null;
  note: string | null;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
}
export interface InviteResolveResponse {
  sender: { user_id: string; name: string | null; photo_url: string | null; headline: string };
  note: string | null;
  expires_at: string;
  is_own: boolean;
  already_connected: boolean;
}
// Decline returns 'ok' and stores nothing, so the sender can't tell it from silence.
export type InviteRespondResponse =
  | { status: 'connected'; connection: { user_id: string; name: string | null } }
  | { status: 'ok' };

// ---------- mocks ----------
/* eslint-disable @typescript-eslint/no-require-imports */
const mocks = {
  ingest: () => require('../../docs/mocks/profile_ingest.json') as IngestResponse,
  status: () => require('../../docs/mocks/profile_status.json') as StatusResponse,
  interests: () => require('../../docs/mocks/profile_interests.json') as InterestsResponse,
  matches: () => require('../../docs/mocks/event_matches.json') as MatchesResponse,
  checkin: () => require('../../docs/mocks/event_checkin.json') as { ok: true },
  starters: () => require('../../docs/mocks/match_starters.json') as StartersResponse,
  qr: () => require('../../docs/mocks/qr_token.json') as QrToken,
  handshake: () => require('../../docs/mocks/handshake.json') as HandshakeResponse,
  feedback: () => require('../../docs/mocks/feedback.json') as FeedbackResponse,
  connections: () => require('../../docs/mocks/connections.json') as ConnectionsResponse,
  inviteCreate: () => require('../../docs/mocks/invites_create.json') as CreateInviteResponse,
  inviteList: () => require('../../docs/mocks/invites_list.json') as { invites: MyInvite[] },
  inviteResolve: () => require('../../docs/mocks/invites_resolve.json') as InviteResolveResponse,
  inviteRespond: () => require('../../docs/mocks/invites_respond.json') as InviteRespondResponse,
};
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------- transport ----------
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

function call<T>(mock: () => T, real: () => Promise<T>): Promise<T> {
  if (!env.useMocks) return real();
  // Small delay so loading states are visible in mock mode.
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(mock())), 250));
}

// ---------- endpoints ----------
export const api = {
  ingestResume: (file: { uri: string; name: string; type?: string }) =>
    call(mocks.ingest, () => {
      const form = new FormData();
      form.append('source', 'resume');
      form.append('file', { uri: file.uri, name: file.name, type: file.type ?? 'application/pdf' } as unknown as Blob);
      return request<IngestResponse>('POST', '/profile/ingest', form);
    }),
  ingest: (body: ManualIngest | LinkedIngest) =>
    call(mocks.ingest, () => request<IngestResponse>('POST', '/profile/ingest', body)),
  profileStatus: (jobId: string) =>
    call(mocks.status, () => request<StatusResponse>('GET', `/profile/status?job_id=${encodeURIComponent(jobId)}`)),
  getInterests: () => call(mocks.interests, () => request<InterestsResponse>('GET', '/profile/interests')),
  patchInterests: (body: InterestsPatch) =>
    call(mocks.interests, () => request<InterestsResponse>('PATCH', '/profile/interests', body)),
  matches: (eventId: number, limit = 20) =>
    call(mocks.matches, () => request<MatchesResponse>('GET', `/events/${eventId}/matches?limit=${limit}`)),
  checkin: (eventId: number) => call(mocks.checkin, () => request<{ ok: true }>('POST', `/events/${eventId}/checkin`, {})),
  starters: (otherUserId: string) =>
    call(mocks.starters, () => request<StartersResponse>('GET', `/matches/${otherUserId}/starters`)),
  qrToken: () => call(mocks.qr, () => request<QrToken>('GET', '/qr/token')),
  handshake: (body: { payload: string; signature: string; event_id: number }) =>
    call(mocks.handshake, () => request<HandshakeResponse>('POST', '/handshake', body)),
  feedback: (body: FeedbackRequest) => call(mocks.feedback, () => request<FeedbackResponse>('POST', '/feedback', body)),
  connections: () => call(mocks.connections, () => request<ConnectionsResponse>('GET', '/connections')),
  createInvite: (body: CreateInviteRequest = {}) =>
    call(mocks.inviteCreate, () => request<CreateInviteResponse>('POST', '/invites', body)),
  myInvites: () => call(mocks.inviteList, () => request<{ invites: MyInvite[] }>('GET', '/invites')),
  revokeInvite: (inviteId: number) =>
    call(() => ({ ok: true as const }), () => request<{ ok: true }>('DELETE', `/invites/${inviteId}`)),
  resolveInvite: (token: string) =>
    call(mocks.inviteResolve, () => request<InviteResolveResponse>('GET', `/invites/resolve/${encodeURIComponent(token)}`)),
  respondInvite: (token: string, response: 'accept' | 'decline') =>
    call(
      () => (response === 'accept' ? mocks.inviteRespond() : ({ status: 'ok' } as const)),
      () => request<InviteRespondResponse>('POST', `/invites/${encodeURIComponent(token)}/respond`, { response }),
    ),
};
