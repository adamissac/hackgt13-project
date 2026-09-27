// Demo backend: a stateful stand-in for the FastAPI service + Supabase, used only in demo mode.
// It implements the same shapes as docs/api.md and plays the other person (they say yes, reply,
// walk over, say yes to connecting) so the whole product loop can be shown on one phone.
// Pure TypeScript (no React Native) so scripts/demo-flow.test.ts can drive it from Node.
import type {
  Connection,
  ConversationFeedbackRequest,
  ConversationFeedbackResponse,
  GraphEdge,
  GraphNode,
  GraphResponse,
  InterestsPatch,
  InterestsResponse,
  LiveEvent,
  LocationShareState,
  Match,
  Meetup,
  PendingConversation,
  QuickProfile,
  StartersResponse,
  Suggestion,
  SuggestionRespondResponse,
} from '../api';
import type { ChatMessage, ChatSummary } from '../../features/chat/model';
import type { Relationship, RelationshipStage } from '../../features/relationship/stage';
import { emitChange } from '../changes';
import { DEMO_EVENT, DEMO_ME, DEMO_MY_INTERESTS, DEMO_PEOPLE, findPerson, type DemoPerson } from './people';

export interface DemoNotification {
  id: number;
  kind: 'suggestion' | 'mutual_meet' | 'new_message' | 'conversation_verified' | 'connect_prompt' | 'connected' | 'event';
  title: string;
  body: string;
  user_id: string | null;
  route: string | null;
  read: boolean;
  created_at: string;
}

interface Rel {
  stage: RelationshipStage;
  chat_id: number | null;
  conversation_id: number | null;
  met_minutes: number | null;
  talked_about: string[];
  sharing_since: number | null;
}

export type OnboardingStatus = 'pending' | 'partial' | 'complete';

interface State {
  onboarding: OnboardingStatus;
  sources: { github: boolean; resume: boolean };
  removedSources: string[];
  openToMeet: boolean;
  checkedIn: boolean;
  rel: Record<string, Rel>;
  hiddenInterests: string[];
  confirmedInterests: string[];
  messages: ChatMessage[];
  replyIndex: Record<string, number>;
  notifications: DemoNotification[];
  connectedAt: Record<string, string>;
  myPoint: { lat: number; lng: number } | null;
  nextId: number;
}

const fresh = (): State => ({
  onboarding: 'pending',
  sources: { github: false, resume: false },
  removedSources: [],
  openToMeet: false,
  checkedIn: false,
  rel: {},
  hiddenInterests: [],
  confirmedInterests: [],
  messages: [],
  replyIndex: {},
  notifications: [
    {
      id: 1,
      kind: 'event',
      title: 'Welcome to HackGT 13',
      body: 'Turn on Open to Meet and we’ll find people here worth talking to.',
      user_id: null,
      route: null,
      read: false,
      created_at: new Date().toISOString(),
    },
  ],
  connectedAt: {},
  myPoint: null,
  nextId: 100,
});

let state: State = fresh();
let saver: ((json: string) => void) | null = null;

/** How long the simulated person takes to respond. Tests set this to 0. */
export const timing = { reactionMs: 2500, replyMs: 2200, verifyAfterCloseMs: 6000 };

export function hydrate(json: string | null) {
  if (!json) return;
  try {
    state = { ...fresh(), ...(JSON.parse(json) as State) };
  } catch {
    state = fresh();
  }
}
export function onSave(fn: (json: string) => void) {
  saver = fn;
}
function save() {
  saver?.(JSON.stringify(state));
}
export function resetDemo() {
  state = fresh();
  save();
  emitChange('relationships', 'chats', 'notifications', 'connections', 'profile', 'meetups');
}

const now = () => new Date().toISOString();
const id = () => ++state.nextId;
const first = (p: DemoPerson) => p.name.split(' ')[0];
const suggestionId = (p: DemoPerson) => 5000 + DEMO_PEOPLE.indexOf(p);
const personForSuggestion = (sid: number) => DEMO_PEOPLE[sid - 5000];

function rel(userId: string): Rel {
  state.rel[userId] ??= { stage: 'DISCOVERED', chat_id: null, conversation_id: null, met_minutes: null, talked_about: [], sharing_since: null };
  return state.rel[userId];
}

function notify(n: Omit<DemoNotification, 'id' | 'read' | 'created_at'>) {
  state.notifications.unshift({ ...n, id: id(), read: false, created_at: now() });
}

function need(userId: string): DemoPerson {
  const p = findPerson(userId);
  if (!p) throw new Error('this profile isn’t available');
  return p;
}

function later(ms: number, fn: () => void) {
  if (ms <= 0) fn();
  else setTimeout(fn, ms);
}

// ---------- onboarding ----------
export function onboarding() {
  return { status: state.onboarding, sources: state.sources };
}
export function setOnboarding(status: OnboardingStatus) {
  if (state.onboarding !== 'complete') state.onboarding = status;
  save();
  emitChange('profile');
  return onboarding();
}
/** Removing a source drops it and the interests that came only from it (like DELETE /profile/sources). */
export function removeSource(source: 'github' | 'resume' | 'manual') {
  if (source === 'github' || source === 'resume') state.sources[source] = false;
  state.removedSources = [...new Set([...(state.removedSources ?? []), source])];
  save();
  emitChange('profile');
  return { removed: source, ...interests() };
}

/** Adding a source runs the (simulated) profile builder; the first success completes onboarding. */
export function addSource(source: 'github' | 'resume') {
  state.sources[source] = true;
  state.removedSources = (state.removedSources ?? []).filter((s) => s !== source);
  state.onboarding = 'complete';
  save();
  emitChange('profile');
  return { interests: DEMO_MY_INTERESTS.filter((i) => source === 'github' ? i.source === 'github' : i.source !== 'github').length };
}

export function skillProfile() {
  const has = state.sources.github || state.sources.resume;
  const src = (s: string) => DEMO_MY_INTERESTS.find((i) => i.name === s)?.source;
  const tag = (name: string): ('github' | 'resume')[] =>
    state.sources.github && state.sources.resume ? ['github', 'resume'] : state.sources.github ? ['github'] : ['resume'];
  return {
    user_id: DEMO_ME,
    skills: has
      ? DEMO_MY_INTERESTS.filter((i) => i.facet === 'technical').map((i) => ({
          name: i.name,
          confidence: i.weight,
          sources: src(i.name) === 'github' ? tag(i.name) : (['resume'] as ('github' | 'resume')[]),
        }))
      : [],
    experience_years_estimate: state.sources.resume ? 1.5 : null,
    domains: has ? ['ml', 'backend', 'mobile'] : [],
    project_highlights: state.sources.github
      ? [
          { name: 'course-rag', description: 'Retrieval pipeline over lecture notes', stars: 14, forks: 3, languages: ['Python'], frameworks: ['fastapi', 'pytorch'], commits_last_year: 212, pinned: true, url: null },
          { name: 'formal-connection', description: 'HackGT 13 networking app', stars: 6, forks: 1, languages: ['TypeScript'], frameworks: ['react native', 'expo'], commits_last_year: 98, pinned: false, url: null },
        ]
      : [],
    generated_at: has ? now() : null,
    profile_version: has ? 1 : 0,
  };
}

// ---------- me ----------
export function getOpenToMeet() {
  return state.openToMeet;
}
export function setOpenToMeet(open: boolean) {
  state.openToMeet = open;
  if (open) state.checkedIn = true;
  // Turning off ends any live location sharing (MASTER_SPEC 3.3).
  if (!open) for (const r of Object.values(state.rel)) r.sharing_since = null;
  save();
  emitChange('relationships', 'meetups', 'profile');
  return { open_to_meet: open };
}
export function checkin() {
  state.checkedIn = true;
  save();
  return { ok: true as const };
}

const DEMO_LIVE_EVENTS: LiveEvent[] = [
  {
    id: DEMO_EVENT.id,
    name: DEMO_EVENT.name,
    host: 'HackGT',
    location: 'Klaus Advanced Computing Building',
    starts_at: null,
    ends_at: null,
    registered: true,
    checked_in: true,
    mine: false,
    description: 'The main HackGT 13 event.',
    promo: 'Talks start at 2. Booth 14 is hiring.',
  },
  // A company event that runs all day on Sep 27 (Atlanta time), to try Attending -> scan QR -> session in demo mode.
  // Check-in has no time window: the QR works any time during (or before) the event.
  {
    id: 777,
    name: 'Demo test event',
    host: 'Demo Company',
    location: 'Klaus atrium',
    starts_at: '2026-09-27T00:00:00-04:00',
    ends_at: '2026-09-27T23:59:00-04:00',
    registered: false,
    checked_in: false,
    mine: false,
    description: 'An all-day test event on Sep 27. Mark yourself Attending, then scan the company QR code to enter the session any time today.',
    promo: 'All day Sep 27. Check in any time.',
  },
];

export function listEvents() {
  return { events: DEMO_LIVE_EVENTS };
}
let demoCompany: { org: import('../api').CompanyOrg; events: import('../api').CompanyEventStudio[] } | null = null;

export function myOrg() {
  if (demoCompany) return { account: 'company' as const, org: demoCompany.org, events: demoCompany.events };
  return { account: 'person' as const, org: null, events: [] };
}
export function companySignup(body: import('../api').CompanySignup) {
  demoCompany = {
    org: {
      id: 1,
      name: body.company_name,
      website: body.website ?? '',
      industry: body.industry ?? 'Other',
      about: body.about ?? '',
      city: body.city ?? '',
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      size_band: body.size_band ?? '',
    },
    events: [],
  };
  return { ok: true as const, org: demoCompany.org };
}
export function patchOrg(body: Partial<import('../api').CompanyOrg>) {
  if (!demoCompany) throw new Error('company account required');
  demoCompany.org = { ...demoCompany.org, ...body };
  return { org: demoCompany.org };
}
export function createOrgEvent(body: { name: string; location?: string; description?: string; promo?: string }) {
  if (!demoCompany) throw new Error('company account required');
  const event = {
    id: 800 + demoCompany.events.length,
    name: body.name,
    location: body.location ?? '',
    starts_at: null,
    ends_at: null,
    description: body.description ?? '',
    promo: body.promo ?? '',
    join_code: 'ABC-123',
    registered: 0,
    checked_in: 0,
  };
  demoCompany.events.unshift(event);
  emitChange('profile');
  return { event };
}
export function eventStudio(eventId: number) {
  const event = demoCompany?.events.find((e) => e.id === eventId) ?? {
    id: eventId, name: 'Demo event', location: '', starts_at: null, ends_at: null,
    description: '', promo: '', join_code: 'ABC-123', registered: 0, checked_in: 0,
  };
  return {
    event,
    join: { payload: 'demo', signature: 'demo', expires_at: new Date().toISOString(), qr_payload: 'demo.demo' },
    posts: [] as { id: number; body: string; created_at: string }[],
  };
}
export function rotateJoinCode(eventId: number) {
  const code = 'NEW-001';
  const ev = demoCompany?.events.find((e) => e.id === eventId);
  if (ev) ev.join_code = code;
  return { join_code: code };
}
export function promoteEvent(eventId: number, body: string) {
  const ev = demoCompany?.events.find((e) => e.id === eventId);
  if (ev) ev.promo = body;
  return { post: { id: 1, body, created_at: new Date().toISOString() } };
}
export function enterEventCode(_code: string) {
  return { event_id: DEMO_EVENT.id, name: DEMO_EVENT.name };
}
export function eventUpdates(eventId: number) {
  const ev = DEMO_LIVE_EVENTS.find((e) => e.id === eventId);
  return {
    event_id: eventId,
    promo: ev?.promo ?? '',
    description: ev?.description ?? '',
    posts: ev?.promo ? [{ id: 1, body: ev.promo, created_at: new Date().toISOString() }] : [],
  };
}
export function createOrg(name: string) {
  const { org } = companySignup({
    company_name: name,
    contact_name: 'Demo',
    contact_email: 'demo@company.test',
    password: 'password1',
  });
  return { org: { id: org.id, name: org.name } };
}
export function createEvent(body: { name: string; location?: string }) {
  const event: LiveEvent = {
    id: 900 + DEMO_LIVE_EVENTS.length,
    name: body.name,
    host: demoCompany?.org.name ?? 'Your company',
    location: body.location ?? '',
    starts_at: null,
    ends_at: null,
    registered: false,
    checked_in: false,
    mine: true,
  };
  DEMO_LIVE_EVENTS.push(event);
  return { event };
}
export function registerEvent(eventId: number) {
  const e = DEMO_LIVE_EVENTS.find((x) => x.id === eventId);
  // Registering is not checking in: that needs the organizer's QR at the venue (joinEvent).
  if (e) e.registered = true;
  return { ok: true as const };
}
export function eventJoinToken(eventId: number = DEMO_EVENT.id) {
  // Like the server: only the company that owns the event gets its check-in QR.
  if (!DEMO_LIVE_EVENTS.find((x) => x.id === eventId)?.mine) throw new Error('organizers only');
  return {
    payload: `demo-event-${eventId}`,
    signature: 'demo',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    event_id: eventId,
    qr_payload: `demo-event-${eventId}.demo`,
  };
}
export function joinEvent(body: { payload: string; signature: string }) {
  const id = Number(body.payload.replace('demo-event-', ''));
  const e = DEMO_LIVE_EVENTS.find((x) => x.id === id);
  if (!e || body.signature !== 'demo') throw new Error('invalid_signature');
  if (!e.registered) throw new Error('register for this event first');
  e.checked_in = true;
  return { event_id: e.id, name: e.name };
}

export function interests(): InterestsResponse {
  return {
    user_id: DEMO_ME,
    seeking: 'An AI/ML internship and people who have shipped RAG systems',
    offering: 'RAG pipelines, Python tooling, React Native',
    interests: DEMO_MY_INTERESTS.filter((i) => !(state.removedSources ?? []).includes(i.source)).map((i, n) => ({
      interest_id: n + 1,
      ...i,
      confirmed: state.confirmedInterests.includes(i.name),
      hidden: state.hiddenInterests.includes(i.name),
    })),
  };
}
export function patchInterests(body: InterestsPatch): InterestsResponse {
  const byId = (ids: number[] | undefined) => (ids ?? []).map((n) => DEMO_MY_INTERESTS[n - 1]?.name).filter(Boolean) as string[];
  state.confirmedInterests = [...new Set([...state.confirmedInterests, ...byId(body.confirm)])];
  state.hiddenInterests = [...new Set([...state.hiddenInterests, ...byId(body.hide)])];
  save();
  emitChange('profile');
  return interests();
}

// ---------- matching ----------
export function matches(): { event_id: number; model: string; matches: Match[] } {
  return {
    event_id: DEMO_EVENT.id,
    model: 'demo',
    matches: DEMO_PEOPLE.map((p, i) => ({
      user_id: p.user_id,
      name: p.name,
      photo_url: null,
      role: p.role,
      score: p.score,
      rank: i + 1,
      highlight: p.score >= 0.8,
      why: p.shared.map((s) => s.name).slice(0, 3),
      // Simulated Bluetooth distance band (the Nearby map's scan switch shows these).
      proximity: p.band,
    })),
  };
}

export function quickProfile(userId: string): QuickProfile {
  const p = need(userId);
  return {
    user_id: p.user_id,
    name: p.name,
    photo_url: null,
    role: p.role,
    headline: `${p.headline} · ${p.school}`,
    seeking: p.seeking,
    offering: p.offering,
    connected: rel(userId).stage === 'CONNECTED',
    // Curated demo scores have no computed feature attribution: exercise the honest unavailable state.
    score: p.score,
    shared_topics: p.shared,
    facet_overlap: p.facet_overlap,
    complementarity: p.complementarity,
  };
}

export function starters(userId: string, variant = 0): StartersResponse {
  const p = need(userId);
  const n = p.openers.length;
  const start = ((variant % n) + n) % n;
  return { why: p.why, openers: [...p.openers.slice(start), ...p.openers.slice(0, start)] };
}

export function suggestions(): { suggestions: Suggestion[] } {
  if (!state.openToMeet) return { suggestions: [] };
  return {
    suggestions: DEMO_PEOPLE.filter((p) => p.score >= 0.7 && rel(p.user_id).stage === 'DISCOVERED').map((p) => ({
      suggestion_id: suggestionId(p),
      context: 'event' as const,
      event_id: DEMO_EVENT.id,
      building_id: null,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      other: { user_id: p.user_id, name: p.name, photo_url: null, role: p.role, headline: p.headline },
      score: p.score,
      shared_topics: p.shared.map((s) => s.name).slice(0, 3),
    })),
  };
}

export function relationship(userId: string): Relationship {
  const p = need(userId);
  const r = rel(userId);
  return {
    user_id: userId,
    stage: r.stage,
    suggestion_id: suggestionId(p),
    chat_id: r.chat_id,
    conversation_id: r.conversation_id,
  };
}

function ensureChat(p: DemoPerson): number {
  const r = rel(p.user_id);
  r.chat_id ??= 7000 + DEMO_PEOPLE.indexOf(p);
  return r.chat_id;
}

/** Silent consent: always "waiting" unless both have said yes; a no is never shown to anyone. */
export function respond(sid: number, response: 'yes' | 'no'): SuggestionRespondResponse {
  const p = personForSuggestion(sid);
  if (!p) throw new Error('suggestion not found');
  const r = rel(p.user_id);
  if (response === 'no') {
    if (r.stage === 'DISCOVERED') r.stage = 'DECLINED';
    save();
    emitChange('relationships');
    return { status: 'waiting' };
  }
  if (r.stage === 'MUTUAL_MEET' || r.stage === 'MEETUP_IN_PROGRESS') return { status: 'matched', chat_id: ensureChat(p) };
  if (r.stage !== 'DISCOVERED' && r.stage !== 'DECLINED') return { status: 'waiting' };
  r.stage = 'MEET_INTEREST_PENDING';
  save();
  emitChange('relationships');
  if (p.saysYes) {
    later(timing.reactionMs, () => {
      if (rel(p.user_id).stage !== 'MEET_INTEREST_PENDING') return;
      rel(p.user_id).stage = 'MUTUAL_MEET';
      const chatId = ensureChat(p);
      notify({
        kind: 'mutual_meet',
        title: `You and ${first(p)} both want to meet`,
        body: 'Your chat is open, and you can find each other.',
        user_id: p.user_id,
        route: `/chat/${chatId}`,
      });
      save();
      emitChange('relationships', 'chats', 'notifications');
    });
  }
  return { status: 'waiting' };
}

// ---------- chat ----------
export function listChats(): ChatSummary[] {
  return DEMO_PEOPLE.filter((p) => rel(p.user_id).chat_id !== null)
    .map((p) => {
      const chatId = rel(p.user_id).chat_id!;
      const last = state.messages.filter((m) => m.chat_id === chatId).at(-1) ?? null;
      return {
        id: chatId,
        other_user_id: p.user_id,
        other_name: p.name,
        origin: rel(p.user_id).stage === 'CONNECTED' ? ('connection' as const) : ('suggestion' as const),
        last_body: last?.body ?? null,
        last_at: last?.created_at ?? null,
      };
    })
    .sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));
}

function personForChat(chatId: number): DemoPerson {
  const p = DEMO_PEOPLE.find((x) => rel(x.user_id).chat_id === chatId);
  if (!p) throw new Error('This chat is not available');
  return p;
}

export function loadThread(chatId: number) {
  const p = personForChat(chatId);
  return {
    id: chatId,
    other_user_id: p.user_id,
    other_name: p.name,
    messages: state.messages.filter((m) => m.chat_id === chatId),
  };
}

export function sendMessage(chatId: number, body: string, isAiDraft: boolean): ChatMessage {
  const p = personForChat(chatId);
  const text = body.trim();
  if (!text) throw new Error('Write a message first');
  const message: ChatMessage = { id: id(), chat_id: chatId, sender_id: DEMO_ME, body: text, is_ai_draft: isAiDraft, created_at: now() };
  state.messages.push(message);
  save();
  const n = state.replyIndex[p.user_id] ?? 0;
  if (n < p.replies.length) {
    state.replyIndex[p.user_id] = n + 1;
    later(timing.replyMs, () => {
      state.messages.push({ id: id(), chat_id: chatId, sender_id: p.user_id, body: p.replies[n], is_ai_draft: false, created_at: now() });
      notify({ kind: 'new_message', title: `${first(p)} replied`, body: p.replies[n], user_id: p.user_id, route: `/chat/${chatId}` });
      save();
      emitChange('chats', 'notifications');
    });
  }
  return message;
}

// ---------- find each other ----------
export function meetups(): { meetups: Meetup[] } {
  return {
    meetups: DEMO_PEOPLE.filter((p) => ['MUTUAL_MEET', 'MEETUP_IN_PROGRESS'].includes(rel(p.user_id).stage)).map((p) => ({
      suggestion_id: suggestionId(p),
      other: { user_id: p.user_id, name: p.name, photo_url: null },
    })),
  };
}

function mutualFor(sid: number): DemoPerson {
  const p = personForSuggestion(sid);
  if (!p || !['MUTUAL_MEET', 'MEETUP_IN_PROGRESS'].includes(rel(p.user_id).stage)) throw new Error('sharing ended');
  return p;
}

export function shareLocation(sid: number, point: { lat: number; lng: number }) {
  const p = mutualFor(sid);
  const r = rel(p.user_id);
  state.myPoint = point;
  if (r.sharing_since === null) r.sharing_since = Date.now();
  r.stage = 'MEETUP_IN_PROGRESS';
  save();
  emitChange('relationships', 'meetups');
  return { sharing: true, expires_at: new Date(r.sharing_since + 30 * 60_000).toISOString() };
}

/** They walk toward you: ~40 m away, closing ~1.5 m/s, never exact. Close for a while = a conversation. */
export function locationShare(sid: number): LocationShareState {
  const p = mutualFor(sid);
  const r = rel(p.user_id);
  const base = { suggestion_id: sid, other: { user_id: p.user_id, name: p.name } };
  if (r.sharing_since === null || !state.myPoint) return { ...base, sharing: false, expires_at: null, their_location: null };
  const elapsed = (Date.now() - r.sharing_since) / 1000;
  const meters = Math.max(3, 40 - elapsed * 1.5);
  const bearing = (60 * Math.PI) / 180;
  const dLat = (meters * Math.cos(bearing)) / 111_320;
  const dLng = (meters * Math.sin(bearing)) / (111_320 * Math.cos((state.myPoint.lat * Math.PI) / 180));
  if (meters <= 4 && elapsed * 1000 > (40 - 4) / 1.5 * 1000 + timing.verifyAfterCloseMs) verifyConversation(p.user_id, 'ble');
  return {
    ...base,
    sharing: true,
    expires_at: new Date(r.sharing_since + 30 * 60_000).toISOString(),
    their_location: { lat: state.myPoint.lat + dLat, lng: state.myPoint.lng + dLng, updated_at: now() },
  };
}

export function stopLocationShare(sid: number) {
  const p = personForSuggestion(sid);
  if (p) {
    const r = rel(p.user_id);
    r.sharing_since = null;
    if (r.stage === 'MEETUP_IN_PROGRESS') r.stage = 'MUTUAL_MEET';
    save();
    emitChange('relationships', 'meetups');
  }
  return { sharing: false };
}

// ---------- verification + post-conversation ----------
/** A verified in-person conversation (what Bluetooth or the QR scan confirms in live mode). */
export function verifyConversation(userId: string, method: 'ble' | 'qr' = 'ble'): PendingConversation {
  const p = need(userId);
  const r = rel(userId);
  if (r.conversation_id === null || !['CONVERSATION_VERIFIED', 'POST_CONVERSATION_PENDING', 'CONNECTED'].includes(r.stage)) {
    r.conversation_id = 9000 + DEMO_PEOPLE.indexOf(p);
    r.met_minutes = 8;
    r.sharing_since = null;
    r.stage = 'POST_CONVERSATION_PENDING';
    notify({
      kind: 'conversation_verified',
      title: `Conversation with ${first(p)} verified`,
      body: 'You talked for about 8 minutes. Tell us how it went.',
      user_id: userId,
      route: `/checklist/${r.conversation_id}`,
    });
    save();
    emitChange('relationships', 'notifications', 'meetups');
  }
  return pendingFor(p, method);
}

function pendingFor(p: DemoPerson, method: 'ble' | 'qr'): PendingConversation {
  const r = rel(p.user_id);
  return {
    conversation_id: r.conversation_id!,
    method,
    event_id: DEMO_EVENT.id,
    minutes: r.met_minutes,
    created_at: now(),
    other: { user_id: p.user_id, name: p.name, photo_url: null },
    checklist: p.shared.map((s) => ({ interest_id: s.interest_id, name: s.name })),
  };
}

export function pendingConversations(): { conversations: PendingConversation[] } {
  return {
    conversations: DEMO_PEOPLE.filter((p) => rel(p.user_id).stage === 'POST_CONVERSATION_PENDING').map((p) => pendingFor(p, 'ble')),
  };
}

export function conversationFeedback(conversationId: number, body: ConversationFeedbackRequest): ConversationFeedbackResponse {
  const p = DEMO_PEOPLE.find((x) => rel(x.user_id).conversation_id === conversationId);
  if (!p) throw new Error('conversation not found');
  const r = rel(p.user_id);
  const names = p.shared.filter((s) => body.talked_about.includes(s.interest_id)).map((s) => s.name);
  r.talked_about = [...names, ...(body.other_topic ? [body.other_topic] : [])];
  if (!body.wants_connect) {
    r.stage = 'DECLINED';
    save();
    emitChange('relationships');
    return { status: 'no_connection' };
  }
  if (!p.saysYes) {
    save();
    return { status: 'waiting' };
  }
  r.stage = 'CONNECTED';
  state.connectedAt[p.user_id] = now();
  const chatId = ensureChat(p);
  notify({ kind: 'connected', title: `You’re connected with ${first(p)}`, body: 'You both said yes after talking.', user_id: p.user_id, route: `/connections` });
  save();
  emitChange('relationships', 'connections', 'notifications', 'chats');
  return { status: 'connected', connection: { user_id: p.user_id, name: p.name }, chat_id: chatId };
}

export function followupDraft(userId: string) {
  const p = need(userId);
  const topic = rel(userId).talked_about[0] ?? p.shared[0]?.name ?? 'your project';
  return { draft: `Great meeting you at HackGT, ${first(p)}! Loved talking about ${topic}. Want to grab coffee next week and keep going?` };
}

// ---------- connections ----------
export function connections(): { connections: Connection[] } {
  return {
    connections: DEMO_PEOPLE.filter((p) => rel(p.user_id).stage === 'CONNECTED').map((p) => ({
      user_id: p.user_id,
      name: p.name,
      photo_url: null,
      headline: p.headline,
      how_met: 'in_person' as const,
      met_at: DEMO_EVENT.name,
      created_at: state.connectedAt[p.user_id] ?? now(),
      talked_about: rel(p.user_id).talked_about,
      minutes_talked: rel(p.user_id).met_minutes ?? 0,
    })),
  };
}
export function connection(userId: string) {
  const c = connections().connections.find((x) => x.user_id === userId);
  if (!c) throw new Error('not connected');
  return { ...c, shared_topics: need(userId).shared.map((s) => s.name) };
}

// ---------- notifications ----------
export function notifications(): DemoNotification[] {
  return state.notifications;
}
export function markNotificationsRead() {
  state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
  save();
  emitChange('notifications');
}

// ---------- graph (Graph tab, api.md 26) ----------
export function graph(mode: 'matches' | 'network'): GraphResponse {
  const people = mode === 'network' ? DEMO_PEOPLE.filter((p) => rel(p.user_id).stage === 'CONNECTED') : DEMO_PEOPLE;
  const topics = new Map<string, { id: string; facet: string }>();
  const nodes: GraphNode[] = [{ id: 'me', type: 'self', label: 'You' }];
  const edges: GraphEdge[] = [];
  const topicNode = (name: string, facet: string) => {
    if (!topics.has(name)) {
      const tid = `t_${topics.size + 1}`;
      topics.set(name, { id: tid, facet });
      nodes.push({ id: tid, type: 'topic', label: name, facet: facet as never });
    }
    return topics.get(name)!.id;
  };
  for (const i of DEMO_MY_INTERESTS.slice(0, 6)) edges.push({ source: 'me', target: topicNode(i.name, i.facet), kind: 'has_topic', weight: i.weight });
  for (const p of people) {
    const pid = `u_${p.user_id}`;
    const connected = rel(p.user_id).stage === 'CONNECTED';
    nodes.push({
      id: pid,
      type: 'person',
      label: first(p),
      name: p.name,
      role: p.role,
      score: p.score,
      highlight: p.score >= 0.8,
      open_to_meet: true,
      cluster: null,
      connected,
      connected_at: state.connectedAt[p.user_id] ?? null,
      top_topic: p.shared[0]?.name ?? '',
      why: p.shared.map((s) => s.name),
      shared_count: p.shared.length,
      how_met: connected ? 'in_person' : undefined,
    });
    edges.push({ source: 'me', target: pid, kind: connected ? 'connection' : 'match', weight: p.score });
    for (const s of p.shared) edges.push({ source: pid, target: topicNode(s.name, s.facet), kind: 'has_topic', weight: s.strength });
  }
  return { nodes, edges, synthetic: true };
}

/** Everything the demo assistant may know, sent to POST /assistant/demo (fictional people only). */
export function assistantContext() {
  const me = interests();
  return {
    event: DEMO_EVENT,
    user: {
      name: 'You',
      headline: 'CS @ Georgia Tech · building RAG tools',
      seeking: me.seeking,
      offering: me.offering,
      open_to_meet: state.openToMeet,
      interests: me.interests.filter((i) => !i.hidden).map((i) => ({ name: i.name, evidence: i.evidence })),
    },
    people: DEMO_PEOPLE.map((p) => ({
      name: p.name,
      role: p.role,
      headline: p.headline,
      school: p.school,
      bio: p.bio,
      skills: p.skills,
      goals: p.goals,
      seeking: p.seeking,
      offering: p.offering,
      match_percent: Math.round(p.score * 100),
      proximity: state.openToMeet ? { immediate: 'very close', near: 'nearby', far: 'farther away' }[p.band] : 'unknown (Open to Meet is off)',
      why_you_match: p.why,
      shared_topics: p.shared.map((t) => ({ topic: t.name, their_evidence: t.evidence })),
      suggested_openers: p.openers,
      status_with_user: {
        DISCOVERED: 'not introduced yet',
        MEET_INTEREST_PENDING: 'user said they want to meet; waiting',
        MUTUAL_MEET: 'both want to meet; chat is open',
        MEETUP_IN_PROGRESS: 'on the way to meet',
        CONVERSATION_VERIFIED: 'talked in person',
        POST_CONVERSATION_PENDING: 'talked in person; deciding whether to connect',
        CONNECTED: 'connected',
        DECLINED: 'user passed',
        EXPIRED: 'introduction ended',
        CANCELLED: 'introduction ended',
      }[rel(p.user_id).stage],
      talked_about: rel(p.user_id).talked_about,
    })),
  };
}

/** Read-only view for the assistant. */
export function snapshot() {
  return { openToMeet: state.openToMeet, people: DEMO_PEOPLE.map((p) => ({ person: p, stage: rel(p.user_id).stage })) };
}
