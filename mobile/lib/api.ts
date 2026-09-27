// Typed client for the FastAPI service. Shapes are hand-written from docs/api.md;
// keep them in sync (contract-keeper checks this). With EXPO_PUBLIC_USE_MOCKS=1 every call
// resolves with the matching file in docs/mocks/ instead of hitting the network.

import type { Relationship } from '../features/relationship/stage';
import { File as ExpoFile } from 'expo-file-system';

import { emitChange } from './changes';
import { demo, demoAssistantReply, demoReady } from './demo';
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
export interface CompanyOrg {
  id: number;
  name: string;
  website: string;
  industry: string;
  about: string;
  city: string;
  contact_name: string;
  contact_email: string;
  size_band: string;
}
export interface CompanyEventStudio {
  id: number;
  name: string;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string;
  promo: string;
  join_code: string | null;
  registered: number;
  checked_in: number;
}
export interface CompanySignup {
  company_name: string;
  contact_name: string;
  contact_email: string;
  password: string;
  website?: string;
  industry?: string;
  city?: string;
  about?: string;
  size_band?: string;
}
export interface LiveEvent {
  id: number;
  name: string;
  host: string;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  description?: string;
  promo?: string;
  registered: boolean;
  checked_in: boolean;
  mine: boolean;
}
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
  headline?: string;
  how_met?: 'in_person' | 'invite';
  met_at: string | null;
  created_at: string;
  talked_about: string[];
  minutes_talked: number;
}
export interface ConnectionsResponse { connections: Connection[] }
export type ConnectionDetail = Connection & { shared_topics: string[] };

export interface SharedTopic { interest_id: number; name: string; facet: Facet; strength: number; evidence: string }
export interface MatchExplanation {
  summary: string;
  basis: 'v1' | 'lr' | 'v1_proxy';
  factors: { name: string; label: string; value: number; contribution: number; share: number }[];
  all_factors?: MatchExplanation['factors'];
  varied?: boolean;
}
export type GraphExplanation = Omit<MatchExplanation, 'factors' | 'all_factors'> & {
  factors: Pick<MatchExplanation['factors'][number], 'label' | 'contribution' | 'share'>[];
};
export interface QuickProfile {
  user_id: string;
  name: string;
  photo_url: string | null;
  role: 'student' | 'recruiter';
  headline: string;
  seeking: string;
  offering: string;
  connected: boolean;
  /** Seeded demo attendee: can't meet over Bluetooth/QR, so the app offers "simulate meeting". */
  demo_attendee?: boolean;
  score: number;
  shared_topics: SharedTopic[];
  facet_overlap: Record<Facet, number>;
  complementarity: number;
  explanation?: MatchExplanation;
}

export interface Suggestion {
  suggestion_id: number;
  context: 'event' | 'public' | 'reconnect';
  event_id: number | null;
  building_id: string | null;
  expires_at: string;
  other: Person & { role: 'student' | 'recruiter'; headline: string };
  score: number;
  shared_topics: string[];
}
export interface SuggestionsResponse { suggestions: Suggestion[] }
// "waiting" covers every outcome except a mutual yes, whatever the other person did.
export type SuggestionRespondResponse = { status: 'waiting' } | { status: 'matched'; chat_id: number };

// QR verification + post-conversation flow (sections 19, 20, 23). Silent: "waiting" whatever the other said.
export interface QrVerifyResponse extends HandshakeResponse { conversation_id: number }
export interface ConversationFeedbackRequest { talked_about: number[]; other_topic: string; wants_connect: boolean }
export type ConversationFeedbackResponse =
  | { status: 'waiting' }
  | { status: 'connected'; connection: { user_id: string; name: string }; chat_id: number }
  | { status: 'no_connection' };
export interface PendingConversation {
  conversation_id: number;
  method: 'qr' | 'ble';
  event_id: number | null;
  minutes: number | null;
  created_at: string;
  other: Person;
  checklist: { interest_id: number; name: string }[];
}

// Tap to verify (section 38): both phones claim each other's Bluetooth token at touching range.
export type TapClaimResponse = { status: 'waiting' } | ({ status: 'verified' } & QrVerifyResponse);

// Meetup location sharing (section 37). Only after a mutual yes; ends when they meet or after 30 min.
export interface LocationShareState {
  suggestion_id: number;
  other: { user_id: string; name: string | null };
  sharing: boolean;
  expires_at: string | null;
  their_location: { lat: number; lng: number; updated_at: string } | null;
}
export interface Meetup { suggestion_id: number; other: Person }

// Bluetooth (section 12). Tokens rotate every 10 minutes; only the server maps them to users.
export interface BleToken { token: string; valid_from: string; valid_to: string }
export interface BleSighting { token: string; rssi: number; ts: string; zone_id: number | null }
export interface BleSightingsRequest {
  event_id: number | null;
  device_model?: string | null;
  foreground?: boolean;
  sightings: BleSighting[];
}

// Private invites (section 36). The token appears only inside `url`, returned once.
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


// ---------- graph + personal dashboard + feed insights (api.md 26, 27, 32, 34) ----------
export type GraphMode = 'matches' | 'network';
export interface GraphPerson {
  id: string; type: 'person'; label: string; score: number; highlight: boolean; open_to_meet: boolean;
  cluster: number | null; connected: boolean; connected_at: string | null; top_topic: string;
  name?: string; role?: 'student' | 'recruiter'; why?: string[]; shared_count?: number; how_met?: 'in_person' | 'invite';
}
export interface GraphTopic { id: string; type: 'topic'; label: string; facet: Facet; evidence?: string }
export type GraphNode = { id: string; type: 'self'; label: string } | GraphPerson | GraphTopic;
export interface GraphEdge { source: string; target: string; kind: 'match' | 'connection' | 'has_topic'; weight: number; facet?: Facet; explanation?: GraphExplanation }
export interface GraphResponse { nodes: GraphNode[]; edges: GraphEdge[]; synthetic?: boolean }
export interface MeDashboard {
  total: number; days: number;
  growth: { date: string; total: number }[];
  how_met: { in_person: number; invite: number };
  top_topics: { name: string; facet: Facet; connections: number; talked: number }[];
}
export interface FeedInsights {
  days: number;
  trending_topics: { name: string; count: number }[];
  activity: { date: string; count: number }[];
  by_kind: { github: number; post: number; update: number };
}
export interface FeedAuthor { user_id: string; name: string; photo_url: string | null }
// Brief on a GitHub item (api.md 29): what they built, from the repo's public data only.
export interface FeedDetails {
  summary: string;
  highlights: string[];
  ask: string | null;
  stack: string[];
  ai: boolean;
}
export interface FeedItemEntry {
  type: 'item';
  item_id: number;
  author: FeedAuthor;
  kind: 'github' | 'post' | 'update';
  title: string | null;
  body: string | null;
  url: string | null;
  created_at: string;
  score: number;
  talked_about: string[];
  details?: FeedDetails | null;
}
export type FeedEntry =
  | FeedItemEntry
  | {
      type: 'summary';
      author: FeedAuthor;
      summary: string;
      item_ids: number[];
      created_at: string;
      score: number;
      items?: FeedItemEntry[];
    };
export interface FeedResponse { items: FeedEntry[]; next_cursor: string | null }
export interface FeedPostResponse {
  item_id: number;
  kind: 'post' | 'update';
  title: string | null;
  body: string;
  url: string | null;
  created_at: string;
}
// Structured skill profile (GET /profile/skills, docs/ONBOARDING.md).
export interface SkillProfile {
  user_id: string;
  skills: { name: string; confidence: number; sources: ('github' | 'resume' | 'manual')[] }[];
  experience_years_estimate: number | null;
  domains: string[];
  project_highlights: {
    name: string;
    description: string;
    stars: number;
    forks: number;
    languages: string[];
    frameworks: string[];
    commits_last_year: number | null;
    pinned: boolean;
    url: string | null;
  }[];
  generated_at: string | null;
  profile_version: number;
}
export interface AssistantMessage { role: 'user' | 'assistant'; content: string }

// ---------- account connections (api.md 33, 39-41) ----------
export type SignInProvider = 'linkedin' | 'email' | string | null;
export interface SourceStatus { added: boolean; updated_at: string | null; interests: number }
export interface GithubStatus extends SourceStatus {
  /** Public repos the last import read; 0 = connected but nothing public (null = never imported). */
  repo_count?: number | null;
  available: boolean;
  connected: boolean;
  login: string | null;
  last_synced_at: string | null;
}
export interface AccountsResponse {
  sign_in: { provider: SignInProvider; email: string | null };
  profile: {
    name: string | null;
    photo_url: string | null;
    headline: string;
    experience: string;
    seeking: string;
    offering: string;
    interests_text: string;
    web_search_opt_in: boolean;
  };
  sources: {
    github: GithubStatus;
    resume: SourceStatus;
    manual: SourceStatus;
    facebook: { available: boolean; connected: boolean };
  };
}
export interface ManualProfile { headline: string; experience: string; interests_text: string; seeking: string; offering: string }
export interface ManualResponse { profile: ManualProfile; job_id: string | null; status: 'queued' | 'nothing_to_extract' }
export type ProfileSource = 'github' | 'resume' | 'manual';

// ---------- mocks ----------
const mocks = {
  ingest: () => require('../../docs/mocks/profile_ingest.json') as IngestResponse,
  status: () => require('../../docs/mocks/profile_status.json') as StatusResponse,
  interests: () => require('../../docs/mocks/profile_interests.json') as InterestsResponse,
  qr: () => require('../../docs/mocks/qr_token.json') as QrToken,
  handshake: () => require('../../docs/mocks/handshake.json') as HandshakeResponse,
  feedback: () => require('../../docs/mocks/feedback.json') as FeedbackResponse,
  qrVerify: () => require('../../docs/mocks/qr_verify.json') as QrVerifyResponse,
  tapClaim: () => require('../../docs/mocks/tap_claim.json') as TapClaimResponse,
  bleTokens: () => require('../../docs/mocks/ble_tokens.json') as { tokens: BleToken[] },
  bleSightings: () => require('../../docs/mocks/ble_sightings.json') as { accepted: number; dropped: number },
  inviteCreate: () => require('../../docs/mocks/invites_create.json') as CreateInviteResponse,
  inviteList: () => require('../../docs/mocks/invites_list.json') as { invites: MyInvite[] },
  inviteResolve: () => require('../../docs/mocks/invites_resolve.json') as InviteResolveResponse,
  inviteRespond: () => require('../../docs/mocks/invites_respond.json') as InviteRespondResponse,
  graphExpand: () => require('../../docs/mocks/graph_expand.json') as GraphResponse & { node_id: string },
  meDashboard: () => require('../../docs/mocks/me_dashboard.json') as MeDashboard,
  feedInsights: () => require('../../docs/mocks/feed_insights.json') as FeedInsights,
  feed: () => require('../../docs/mocks/feed.json') as FeedResponse,
  feedReply: () => require('../../docs/mocks/feed_reply_suggestion.json') as { reply: string },
  accounts: () => require('../../docs/mocks/me_accounts.json') as AccountsResponse,
  manual: () => require('../../docs/mocks/profile_manual.json') as ManualResponse,
};

// ---------- transport ----------
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

// Event features (matches, graph, nearby, assistant search) need the user checked in to the event.
// For events with no company (the HackGT demo event) a "check in first" answer checks them in and retries
// once. Company events only check in by scanning the organizer's QR, so there the server refuses and the
// original "check in first" error goes back to the screen, which offers the QR scanner.
async function request<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
  try {
    return await rawRequest<T>(method, path, body);
  } catch (e) {
    const eventId = path.match(/\/events\/(\d+)/)?.[1] ?? path.match(/[?&]event_id=(\d+)/)?.[1];
    if (e instanceof ApiError && e.status === 403 && /check in/i.test(e.message) && eventId && !/checkin/.test(path)) {
      console.log('[api] not checked in; checking in to event', eventId, 'and retrying', path);
      try {
        await rawRequest('POST', `/events/${eventId}/checkin`, {});
      } catch {
        throw e;
      }
      return rawRequest<T>(method, path, body);
    }
    throw e;
  }
}

async function rawRequest<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  // Never hang forever on a stuck server: fail with a readable message after 30 s.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: abort.signal,
    });
  } catch (e) {
    throw new ApiError(0, abort.signal.aborted ? 'The server took too long to answer. Try again.' : `Network error: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

// Demo mode routes every call to lib/demo (a stateful stand-in for the server). Errors thrown there
// surface exactly like server errors, so screens exercise the same loading/error paths.
function call<T>(mock: () => T | Promise<T>, real: () => Promise<T>): Promise<T> {
  if (!env.useMocks) return real();
  return demoReady().then(mock).then(value => structuredClone(value));
}

// Suggestions this phone said yes to. The server never tells us the other side's answer, so this is
// how "I said yes, waiting" survives a reload in live mode (silent consent).
const saidYes = new Set<number>();
// Who each open suggestion is with, and the people I'm waiting on after saying yes. Once I answer, the
// suggestion leaves GET /suggestions, so without this the match screen fell back to "not around yet".
const suggestionWith = new Map<number, string>();
const waitingOn = new Set<string>();

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  user_id: string | null;
  route: string | null;
  read: boolean;
  created_at: string;
}

// Server payloads carry ids, not names (see ml/app: suggestions, conversations, invites). Titles are generic
// on purpose; the route opens the exact screen.
const NOTIFICATION_TEXT: Record<string, (p: Record<string, unknown>) => { title: string; body: string; route: string | null }> = {
  suggestion: (p) =>
    p.status === 'matched'
      ? {
          title: 'You both want to meet 🎉',
          body: 'Your chat is open. Say hi and find each other.',
          route: p.chat_id != null ? `/chat/${p.chat_id}` : '/chats',
        }
      : { title: 'Someone here is worth meeting', body: 'A strong match is nearby. Want to meet?', route: '/' },
  connect_prompt: (p) => ({
    title: 'How did your conversation go?',
    body: 'Your conversation was verified. Tell us if you want to connect.',
    route: p.conversation_id != null ? `/checklist/${p.conversation_id}` : '/',
  }),
  connected: (p) => ({
    title: 'You have a new connection',
    body: p.how_met === 'invite' ? 'You both accepted a private invite.' : 'You both said yes after talking.',
    route: '/connections',
  }),
  mutual_meet: (p) => ({
    title: 'You both want to meet 🎉',
    body: 'Your chat is open.',
    route: p.chat_id != null ? `/chat/${p.chat_id}` : '/chats',
  }),
  invite: () => ({ title: 'New private invite', body: 'Someone you know wants to connect.', route: '/invites' }),
  event_update: () => ({ title: 'Event update', body: 'Something changed at your event.', route: null }),
  connection_attending: () => ({ title: 'A connection is here', body: 'One of your connections is at this event.', route: null }),
};

async function liveRelationship(userId: string): Promise<Relationship> {
  const [conns, pending, sugg, chats] = await Promise.all([
    request<ConnectionsResponse>('GET', '/connections').catch(() => ({ connections: [] as Connection[] })),
    request<{ conversations: PendingConversation[] }>('GET', '/conversations/pending').catch(() => ({ conversations: [] as PendingConversation[] })),
    request<SuggestionsResponse>('GET', '/suggestions').catch(() => ({ suggestions: [] as Suggestion[] })),
    supabase.from('chats').select('id, user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`),
  ]);
  const chat = (chats.data ?? [])[0] as { id: number } | undefined;
  const conv = pending.conversations.find((x) => x.other.user_id === userId);
  sugg.suggestions.forEach((x) => suggestionWith.set(x.suggestion_id, x.other.user_id));
  const sug = sugg.suggestions.find((x) => x.other.user_id === userId);
  const base = { user_id: userId, chat_id: chat?.id ?? null, conversation_id: conv?.conversation_id ?? null, suggestion_id: sug?.suggestion_id ?? null };
  if (conns.connections.some((x) => x.user_id === userId)) return { ...base, stage: 'CONNECTED' };
  if (conv) return { ...base, stage: 'POST_CONVERSATION_PENDING' };
  if (chat) return { ...base, stage: 'MUTUAL_MEET' };
  if (sug && saidYes.has(sug.suggestion_id)) return { ...base, stage: 'MEET_INTEREST_PENDING' };
  if (!sug && waitingOn.has(userId)) return { ...base, stage: 'MEET_INTEREST_PENDING' };
  return { ...base, stage: 'DISCOVERED' };
}

// ---------- endpoints ----------
export const api = {
  accounts: () =>
    call(
      () => {
        const base = mocks.accounts();
        const { sources } = demo.onboarding();
        return {
          ...base,
          sign_in: { provider: 'demo', email: null },
          profile: {
            ...base.profile,
            name: 'You',
            headline: 'CS @ Georgia Tech · building RAG tools',
            seeking: demo.interests().seeking,
            offering: demo.interests().offering,
            interests_text: 'I build retrieval systems and tutor intro CS.',
          },
          sources: {
            ...base.sources,
            github: { ...base.sources.github, connected: sources.github, added: sources.github, login: sources.github ? 'you' : null },
            resume: { ...base.sources.resume, added: sources.resume },
          },
        };
      },
      () => request<AccountsResponse>('GET', '/me/accounts'),
    ),
  patchManual: (body: Partial<ManualProfile>) =>
    call(mocks.manual, () => request<ManualResponse>('PATCH', '/profile/manual', body)),
  removeSource: (source: ProfileSource) =>
    call(
      () => demo.removeSource(source),
      () => request<InterestsResponse & { removed: ProfileSource }>('DELETE', `/profile/sources/${source}`),
    ),
  /** returnTo: where GitHub's callback sends the browser back to (Expo Go and builds differ). */
  githubStart: (returnTo?: string) =>
    call(
      () => ({ url: 'https://github.com/login/oauth/authorize?mock=1' }),
      () =>
        request<{ url: string }>(
          'GET',
          `/connect/github/start${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`,
        ),
    ),
  /** Reuse the consent given at "Continue with GitHub" so the user isn't asked to authorize twice.
   *  Supabase hands us provider_token once, in the session right after sign-in. */
  githubFromSession: (providerToken: string, scopes?: string) =>
    call(
      () => ({ connected: true, login: 'octocat' }),
      () => request<{ connected: boolean; login: string }>('POST', '/connect/github/session', {
        provider_token: providerToken,
        ...(scopes ? { scopes } : {}),
      }),
    ),
  ingestResume: (file: { uri: string; name: string; type?: string }) =>
    call(mocks.ingest, () => {
      // Expo SDK 57's fetch can't send React Native's `{ uri, name, type }` form parts ("Unsupported
      // FormDataPart implementation": every upload failed on the phone before reaching the server). It sends
      // anything with bytes(): expo-file-system's File reads the picked file and supplies name + type.
      const form = new FormData();
      form.append('source', 'resume');
      form.append('file', new ExpoFile(file.uri) as unknown as Blob);
      return request<IngestResponse>('POST', '/profile/ingest', form);
    }),
  ingest: (body: ManualIngest | LinkedIngest) =>
    call(mocks.ingest, () => request<IngestResponse>('POST', '/profile/ingest', body)),
  profileStatus: (jobId: string) =>
    call(mocks.status, () => request<StatusResponse>('GET', `/profile/status?job_id=${encodeURIComponent(jobId)}`)),
  getInterests: () => call(demo.interests, () => request<InterestsResponse>('GET', '/profile/interests')),
  patchInterests: (body: InterestsPatch) =>
    call(() => demo.patchInterests(body), () => request<InterestsResponse>('PATCH', '/profile/interests', body)),
  nearby: (eventId: number) =>
    call(() => { const r = demo.matches(); return { ...r, model: 'proximity', matches: r.matches.filter(m => m.proximity).map(m => ({ ...m, score: 0, highlight: false, why: [] })) }; }, () => request<MatchesResponse>('GET', `/events/${eventId}/nearby`)),
  matches: (eventId: number, limit = 20) =>
    call(demo.matches, () => request<MatchesResponse>('GET', `/events/${eventId}/matches?limit=${limit}`)),
  checkin: (eventId: number) => call(demo.checkin, () => request<{ ok: true }>('POST', `/events/${eventId}/checkin`, {})),
  listEvents: () => call(demo.listEvents, () => request<{ events: LiveEvent[] }>('GET', '/events')),
  myOrg: () =>
    call(demo.myOrg, () => request<{ account: 'person' | 'company'; org: CompanyOrg | null; events: CompanyEventStudio[] }>('GET', '/me/org')),
  companySignup: (body: CompanySignup) =>
    call(() => demo.companySignup(body), () =>
      request<{ ok: true; org: CompanyOrg }>('POST', '/orgs/signup', body).then((r) => {
        emitChange('profile');
        return r;
      })),
  patchOrg: (body: Partial<CompanyOrg>) =>
    call(() => demo.patchOrg(body), () => request<{ org: CompanyOrg }>('PATCH', '/orgs', body).then((r) => {
      emitChange('profile');
      return r;
    })),
  createOrgEvent: (body: { name: string; location?: string; starts_at?: string; ends_at?: string; description?: string; promo?: string }) =>
    call(() => demo.createOrgEvent(body), () =>
      request<{ event: CompanyEventStudio }>('POST', '/orgs/events', body).then((r) => {
        emitChange('profile');
        return r;
      })),
  eventStudio: (eventId: number) =>
    call(() => demo.eventStudio(eventId), () =>
      request<{ event: CompanyEventStudio; join: QrToken & { qr_payload: string }; posts: { id: number; body: string; created_at: string }[] }>(
        'GET',
        `/orgs/events/${eventId}`,
      )),
  rotateJoinCode: (eventId: number) =>
    call(() => demo.rotateJoinCode(eventId), () => request<{ join_code: string }>('POST', `/orgs/events/${eventId}/rotate-code`, {})),
  promoteEvent: (eventId: number, body: string) =>
    call(() => demo.promoteEvent(eventId, body), () =>
      request<{ post: { id: number; body: string; created_at: string } }>('POST', `/orgs/events/${eventId}/promote`, { body })),
  enterEventCode: (code: string) =>
    call(() => demo.enterEventCode(code), () => request<{ event_id: number; name: string }>('POST', '/events/enter', { code })),
  eventUpdates: (eventId: number) =>
    call(() => demo.eventUpdates(eventId), () =>
      request<{ event_id: number; promo: string; description: string; posts: { id: number; body: string; created_at: string }[] }>(
        'GET',
        `/events/${eventId}/updates`,
      )),
  createOrg: (name: string) =>
    call(() => demo.createOrg(name), () => request<{ org: { id: number; name: string } }>('POST', '/orgs', { name })),
  createEvent: (body: { name: string; location?: string; starts_at?: string; ends_at?: string }) =>
    call(() => demo.createEvent(body), () => request<{ event: LiveEvent }>('POST', '/events', body)),
  /** Leave an event (api.md 45a): back to roaming; registration stays so you can scan back in. */
  leaveEvent: (eventId: number) =>
    call(
      () => demo.leaveEvent(eventId),
      () =>
        request<{ ok: true }>('POST', `/events/${eventId}/leave`, {}).then((r) => {
          emitChange('relationships', 'profile');
          return r;
        }),
    ),
  registerEvent: (eventId: number) =>
    call(() => demo.registerEvent(eventId), () => request<{ ok: true }>('POST', `/events/${eventId}/register`, {})),
  unregisterEvent: (eventId: number) =>
    call(() => demo.unregisterEvent(eventId), () => request<{ ok: true }>('POST', `/events/${eventId}/unregister`, {})),
  eventJoinToken: (eventId: number) =>
    call(() => demo.eventJoinToken(eventId), () => request<QrToken & { event_id: number; qr_payload: string }>('GET', `/events/${eventId}/join-token`)),
  joinEvent: (body: { payload: string; signature: string }) =>
    call(() => demo.joinEvent(body), () => request<{ event_id: number; name: string }>('POST', '/events/join', body)),
  starters: (otherUserId: string) =>
    call(() => demo.starters(otherUserId), () => request<StartersResponse>('GET', `/matches/${otherUserId}/starters`)),
  qrToken: () => call(mocks.qr, () => request<QrToken>('GET', '/qr/token')),
  handshake: (body: { payload: string; signature: string; event_id: number }) =>
    call(mocks.handshake, () => request<HandshakeResponse>('POST', '/handshake', body)),
  feedback: (body: FeedbackRequest) => call(mocks.feedback, () => request<FeedbackResponse>('POST', '/feedback', body)),
  connections: () => call(demo.connections, () => request<ConnectionsResponse>('GET', '/connections')),
  gpsToken: (location: GpsFix) => request<{ code: string; expires_at: string }>('POST', '/proximity/token', location),
  gpsVerify: (code: string, location: GpsFix, eventId: number) =>
    request<QrVerifyResponse>('POST', '/proximity/verify', { code, location, event_id: eventId }),
  verifyToken: () => call(mocks.qr, () => request<QrToken>('GET', '/qr/verify-token')),
  qrVerify: (body: { payload: string; signature: string; event_id?: number }) =>
    call(mocks.qrVerify, () => request<QrVerifyResponse>('POST', '/qr/verify', body)),
  conversationFeedback: (conversationId: number, body: ConversationFeedbackRequest) =>
    call(
      // A "no" stays on this phone. The mock mutual-yes payload is only for someone who said yes.
      () => demo.conversationFeedback(conversationId, body),
      () =>
        request<ConversationFeedbackResponse>('POST', `/conversations/${conversationId}/feedback`, body).then((r) => {
          emitChange('relationships', 'connections', 'chats');
          return r;
        }),
    ),
  pendingConversations: () =>
    call(demo.pendingConversations, () => request<{ conversations: PendingConversation[] }>('GET', '/conversations/pending')),
  followupDraft: (userId: string) =>
    call(() => demo.followupDraft(userId), () => request<{ draft: string }>('POST', `/connections/${encodeURIComponent(userId)}/followup-draft`, {})),
  tapClaim: (body: { token: string; rssi: number; event_id?: number }) =>
    call(mocks.tapClaim, () => request<TapClaimResponse>('POST', '/tap/claim', body)),
  meetups: () => call(demo.meetups, () => request<{ meetups: Meetup[] }>('GET', '/location-shares')),
  shareLocation: (suggestionId: number, point: { lat: number; lng: number }) =>
    call(
      () => demo.shareLocation(suggestionId, point),
      () => request<{ sharing: boolean; expires_at: string }>('POST', `/location-shares/${suggestionId}`, point),
    ),
  locationShare: (suggestionId: number) =>
    call(() => demo.locationShare(suggestionId), () => request<LocationShareState>('GET', `/location-shares/${suggestionId}`)),
  stopLocationShare: (suggestionId: number) =>
    call(() => demo.stopLocationShare(suggestionId), () => request<{ sharing: boolean }>('DELETE', `/location-shares/${suggestionId}`)),
  bleTokens: () => call(mocks.bleTokens, () => request<{ tokens: BleToken[] }>('POST', '/ble/tokens', {})),
  bleSightings: (body: BleSightingsRequest) =>
    call(mocks.bleSightings, () => request<{ accepted: number; dropped: number }>('POST', '/ble/sightings', body)),
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
  quickProfile: (otherUserId: string) =>
    call(() => demo.quickProfile(otherUserId), () => request<QuickProfile>('GET', `/matches/${otherUserId}/quick-profile`)),
  setOpenToMeet: (open: boolean) =>
    call(
      () => demo.setOpenToMeet(open),
      () =>
        request<{ open_to_meet: boolean }>('PATCH', '/me/open-to-meet', { open }).then((r) => {
          emitChange('relationships', 'meetups', 'profile');
          return r;
        }),
    ),
  graph: (mode: GraphMode, eventId?: number) =>
    call(() => demo.graph(mode), () =>
      request<GraphResponse>('GET', `/graph?mode=${mode}${eventId ? `&event_id=${eventId}` : ''}&max_people=30`),
    ),
  graphExpand: (nodeId: string, mode: GraphMode, eventId?: number) =>
    call<GraphResponse>(
      () => {
        const m = mocks.graphExpand();
        return m.node_id === nodeId && mode === 'matches' ? m : { nodes: [], edges: [] };
      },
      () =>
        request<GraphResponse>(
          'GET',
          `/graph/expand?node_id=${encodeURIComponent(nodeId)}&mode=${mode}${eventId ? `&event_id=${eventId}` : ''}`,
        ),
    ),
  connection: (userId: string) =>
    call(
      () => demo.connection(userId),
      () => request<ConnectionDetail>('GET', `/connections/${encodeURIComponent(userId)}`),
    ),
  meDashboard: (days = 30) => call(mocks.meDashboard, () => request<MeDashboard>('GET', `/me/dashboard?days=${days}`)),
  feedInsights: (days = 7) => call(mocks.feedInsights, () => request<FeedInsights>('GET', `/feed/insights?days=${days}`)),
  /** eventId: inside a company event, only updates from people checked in there. */
  feed: (cursor?: string, eventId?: number) =>
    call(mocks.feed, () => {
      const q = [cursor ? `cursor=${encodeURIComponent(cursor)}` : '', eventId ? `event_id=${eventId}` : ''].filter(Boolean).join('&');
      return request<FeedResponse>('GET', `/feed${q ? `?${q}` : ''}`);
    }),
  createPost: (body: { kind: 'post' | 'update'; body: string; title?: string | null; url?: string | null }) =>
    call(() => demo.createPost(body), () => request<FeedPostResponse>('POST', '/feed/posts', body)),
  /** Your own posts and updates (so you can edit or delete them). */
  myPosts: () => call(demo.myPosts, () => request<{ items: FeedPostResponse[] }>('GET', '/feed/posts/mine')),
  editPost: (itemId: number, body: { body: string; title?: string | null }) =>
    call(() => demo.editPost(itemId, body), () => request<FeedPostResponse>('PATCH', `/feed/posts/${itemId}`, body)),
  deletePost: (itemId: number) =>
    call(() => demo.deletePost(itemId), () => request<{ ok: true }>('DELETE', `/feed/posts/${itemId}`)),
  /** Remove a connection for both people. The other person gets no notification. */
  removeConnection: (userId: string) =>
    call(() => demo.removeConnection(userId), () => request<{ ok: true }>('DELETE', `/connections/${encodeURIComponent(userId)}`)),
  replySuggestion: (itemId: number) =>
    call(mocks.feedReply, () => request<{ reply: string }>('POST', `/feed/${itemId}/reply-suggestion`, {})),
  assistantChat: (messages: AssistantMessage[], eventId?: number) =>
    call(
      // Demo mode: the real model over the demo people (server rate-limits it). Offline -> local fallback.
      async () => {
        try {
          return await request<{ reply: string }>('POST', '/assistant/demo', { messages, context: demo.assistantContext() });
        } catch (e) {
          if (e instanceof ApiError && e.status === 429) throw e;
          return { reply: demoAssistantReply(messages) };
        }
      },
      () =>
      request<{ reply: string }>('POST', '/assistant/chat', { messages, event_id: eventId ?? null }),
    ),
  suggestions: () =>
    call(demo.suggestions, () =>
      request<SuggestionsResponse>('GET', '/suggestions').then((r) => {
        r.suggestions.forEach((x) => suggestionWith.set(x.suggestion_id, x.other.user_id));
        return r;
      }),
    ),
  /** Demo attendees only: say yes to meeting them now instead of waiting until you're both around. */
  demoMeet: (userId: string) =>
    call(
      () => {
        const sug = demo.suggestions().suggestions.find((x) => x.other.user_id === userId);
        if (!sug) throw new Error('This demo person is not available right now.');
        return demo.respond(sug.suggestion_id, 'yes');
      },
      () =>
        request<SuggestionRespondResponse & { suggestion_id: number }>('POST', '/suggestions/demo', { user_id: userId }).then((r) => {
          saidYes.add(r.suggestion_id);
          waitingOn.add(userId);
          emitChange('relationships', 'chats');
          return r;
        }),
    ),
  respondToSuggestion: (suggestionId: number, response: 'yes' | 'no') =>
    call(
      // A "no" stays on this phone only. The response is "waiting" unless both said yes.
      () => demo.respond(suggestionId, response),
      () =>
        request<SuggestionRespondResponse>('POST', `/suggestions/${suggestionId}/respond`, { response }).then((r) => {
          if (response === 'yes') {
            saidYes.add(suggestionId);
            const other = suggestionWith.get(suggestionId);
            if (other) waitingOn.add(other);
          }
          emitChange('relationships', 'chats');
          return r;
        }),
    ),
  skillProfile: () => call(demo.skillProfile, () => request<SkillProfile>('GET', '/profile/skills')),
  /** Onboarding status on my profile (profiles.onboarding_status; the server sets 'complete'). */
  onboardingStatus: () =>
    call(
      () => demo.onboarding().status,
      async () => {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return 'pending' as const;
        const { data, error } = await supabase.from('profiles').select('onboarding_status').eq('id', auth.user.id).maybeSingle();
        if (error) throw new Error(error.message);
        return ((data as { onboarding_status?: string } | null)?.onboarding_status ?? 'pending') as 'pending' | 'partial' | 'complete';
      },
    ),
  /** Leaving onboarding without a finished profile marks it 'partial' (never downgrades 'complete'). */
  finishOnboarding: () =>
    call(
      () => demo.setOnboarding('partial').status,
      async () => {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return 'pending' as const;
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_status: 'partial' })
          .eq('id', auth.user.id)
          .eq('onboarding_status', 'pending');
        if (error) throw new Error(error.message);
        emitChange('profile');
        return 'partial' as const;
      },
    ),
  /** Demo mode, or a live match with a seeded demo attendee: stand in for Bluetooth/QR verification. */
  simulateConversation: (userId: string) =>
    call(
      () => demo.verifyConversation(userId, 'ble'),
      () =>
        request<PendingConversation>('POST', '/conversations/simulate', { user_id: userId }).then((r) => {
          emitChange('relationships', 'meetups', 'notifications');
          return r;
        }),
    ),
  /** Where I stand with this person (features/relationship/stage.ts). */
  relationship: (userId: string) => call(() => demo.relationship(userId), () => liveRelationship(userId)),
  /** Open to Meet as stored on my profile. */
  getOpenToMeet: () =>
    call(
      () => ({ open_to_meet: demo.getOpenToMeet() }),
      async () => {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { open_to_meet: false };
        const { data, error } = await supabase.from('profiles').select('open_to_meet').eq('id', auth.user.id).maybeSingle();
        if (error) throw new Error(error.message);
        return { open_to_meet: Boolean((data as { open_to_meet?: boolean } | null)?.open_to_meet) };
      },
    ),
  /** In-app notification center. Live: the owner-only `notifications` table (RLS), newest first. */
  notifications: () =>
    call<AppNotification[]>(demo.notifications, async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, payload, read, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: number; kind: string; payload: Record<string, unknown> | null; read: boolean; created_at: string }[]).map((n) => {
        const text = (NOTIFICATION_TEXT[n.kind] ?? (() => ({ title: 'Update', body: '', route: null })))(n.payload ?? {});
        const who = (n.payload?.other_user_id ?? n.payload?.user_id) as string | undefined;
        return { id: n.id, kind: n.kind, read: n.read, created_at: n.created_at, user_id: who ?? null, ...text };
      });
    }),
  markNotificationsRead: () =>
    call(
      () => {
        demo.markNotificationsRead();
        return { ok: true };
      },
      async () => {
        const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false);
        if (error) throw new Error(error.message);
        emitChange('notifications');
        return { ok: true };
      },
    ),
  deleteMe: () =>
    call(
      () => ({ deleted: true, storage_objects_deleted: 0, auth_user_deleted: true, errors: [] as string[] }),
      () =>
        request<{ deleted: boolean; storage_objects_deleted: number | null; auth_user_deleted: boolean | null; errors: string[] }>(
          'DELETE',
          '/me',
        ),
    ),
};

export interface GpsFix { latitude: number; longitude: number; accuracy: number; timestamp: number; mocked: boolean }
