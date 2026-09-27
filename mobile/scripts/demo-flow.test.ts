// End-to-end check of the product loop against the demo backend, from both sides' point of view.
// Run: cd mobile && npx tsx scripts/demo-flow.test.ts
import assert from 'node:assert/strict';

import { demoAssistantReply } from '../lib/demo/assistant';
import * as demo from '../lib/demo/backend';
import { DEMO_PEOPLE } from '../lib/demo/people';
import { buildView, whySentence } from '../features/graph/model';
import type { FeedResponse } from '../lib/api';
import feedMock from '../../docs/mocks/feed.json';

demo.timing.reactionMs = 0;
demo.timing.replyMs = 0;
demo.timing.verifyAfterCloseMs = 0;

const maya = DEMO_PEOPLE.find((p) => p.name === 'Maya Patel')!;
const daniel = DEMO_PEOPLE.find((p) => p.name === 'Daniel Kim')!;
let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
};

demo.resetDemo();

step('New account starts in onboarding; first source completes it', () => {
  assert.equal(demo.onboarding().status, 'pending');
  demo.setOnboarding('partial');
  assert.equal(demo.onboarding().status, 'partial');
  demo.addSource('github');
  assert.equal(demo.onboarding().status, 'complete');
  demo.setOnboarding('partial'); // never downgrades
  assert.equal(demo.onboarding().status, 'complete');
});

step('Resume: upload, remove (its interests go too), upload again', () => {
  demo.addSource('resume');
  assert.equal(demo.onboarding().sources.resume, true);
  const before = demo.interests().interests.length;
  demo.removeSource('resume');
  assert.equal(demo.onboarding().sources.resume, false);
  assert.ok(demo.interests().interests.length < before);
  assert.ok(demo.interests().interests.every((i) => i.source !== 'resume'));
  demo.addSource('resume');
  assert.equal(demo.interests().interests.length, before);
});

step('Open to Meet OFF: no suggestions', () => {
  assert.equal(demo.suggestions().suggestions.length, 0);
});

step('Open to Meet ON: Maya is an 87% match, very close, top suggestion', () => {
  demo.setOpenToMeet(true);
  const m = demo.matches().matches[0];
  assert.equal(m.name, 'Maya Patel');
  assert.equal(Math.round(m.score * 100), 87);
  assert.equal(m.proximity, 'immediate');
  assert.equal(demo.suggestions().suggestions[0].other.name, 'Maya Patel');
});

step('Tapping a person opens THAT person (the reported bug)', () => {
  for (const p of DEMO_PEOPLE) assert.equal(demo.quickProfile(p.user_id).name, p.name);
  assert.throws(() => demo.quickProfile('nobody'));
});

step('Icebreakers regenerate to a different opener', () => {
  assert.notEqual(demo.starters(maya.user_id, 0).openers[0], demo.starters(maya.user_id, 1).openers[0]);
});

step('Want to Meet is silent until both say yes, then chat unlocks', () => {
  const sid = demo.relationship(maya.user_id).suggestion_id!;
  // reactionMs = 0: Maya answers synchronously, but the caller still only sees "waiting".
  assert.deepEqual(demo.respond(sid, 'yes'), { status: 'waiting' });
  const r = demo.relationship(maya.user_id);
  assert.equal(r.stage, 'MUTUAL_MEET');
  assert.ok(r.chat_id);
  assert.ok(demo.notifications().some((n) => n.kind === 'mutual_meet'));
});

step('Daniel also says yes right away, and a no is still never shown', () => {
  assert.deepEqual(demo.respond(demo.relationship(daniel.user_id).suggestion_id!, 'yes'), { status: 'waiting' });
  assert.equal(demo.relationship(daniel.user_id).stage, 'MUTUAL_MEET');
  assert.ok(demo.relationship(daniel.user_id).chat_id);
});

step('Messaging: send, and Maya replies in the same chat', () => {
  const chatId = demo.relationship(maya.user_id).chat_id!;
  demo.sendMessage(chatId, 'Want to meet by the sponsor tables?', false);
  const thread = demo.loadThread(chatId);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.messages[1].sender_id, maya.user_id);
  assert.equal(demo.listChats()[0].last_body, maya.replies[0]);
});

step('Find each other: sharing starts, rough location appears, stop works', () => {
  const sid = demo.relationship(maya.user_id).suggestion_id!;
  demo.shareLocation(sid, { lat: 33.7773, lng: -84.3963 });
  assert.equal(demo.relationship(maya.user_id).stage, 'MEETUP_IN_PROGRESS');
  assert.ok(demo.locationShare(sid).their_location);
  demo.stopLocationShare(sid);
  assert.equal(demo.relationship(maya.user_id).stage, 'MUTUAL_MEET');
});

step('Turning Open to Meet OFF mid-flow ends location sharing', () => {
  const sid = demo.relationship(maya.user_id).suggestion_id!;
  demo.shareLocation(sid, { lat: 33.7773, lng: -84.3963 });
  demo.setOpenToMeet(false);
  assert.equal(demo.locationShare(sid).sharing, false);
  demo.setOpenToMeet(true);
});

step('Conversation verified -> post-conversation checklist is pending', () => {
  demo.verifyConversation(maya.user_id);
  assert.equal(demo.relationship(maya.user_id).stage, 'POST_CONVERSATION_PENDING');
  const pending = demo.pendingConversations().conversations;
  assert.equal(pending.length, 1);
  assert.ok(pending[0].checklist.length >= 3);
});

step('Both say connect -> permanent connection with topics and context', () => {
  const conv = demo.pendingConversations().conversations[0];
  const res = demo.conversationFeedback(conv.conversation_id, {
    talked_about: conv.checklist.slice(0, 2).map((c) => c.interest_id),
    other_topic: 'hackathon team',
    wants_connect: true,
  });
  assert.equal(res.status, 'connected');
  const c = demo.connections().connections;
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'Maya Patel');
  assert.deepEqual(c[0].talked_about, ['retrieval-augmented generation', 'AI internships', 'hackathon team']);
  assert.equal(demo.relationship(maya.user_id).stage, 'CONNECTED');
});

step('Saying no after talking: no connection, no signal', () => {
  const sara = DEMO_PEOPLE.find((p) => p.name === 'Sara Chen')!;
  demo.verifyConversation(sara.user_id);
  const conv = demo.pendingConversations().conversations[0];
  assert.equal(demo.conversationFeedback(conv.conversation_id, { talked_about: [], other_topic: '', wants_connect: false }).status, 'no_connection');
  assert.equal(demo.connections().connections.length, 1);
});

step('Assistant answers who to meet, topic search, icebreakers, why', () => {
  const ask = (q: string) => demoAssistantReply([{ role: 'user', content: q }]);
  assert.match(ask('Who should I meet?'), /Maya Patel/);
  assert.match(ask('Who here should I talk to about RAG?'), /Maya/);
  assert.match(ask('Who is into quant?'), /Daniel/);
  assert.match(ask('What should I ask Maya?'), /RAG|retrieval/);
  assert.match(ask('Why did you match me with Daniel?'), /reinforcement learning/);
  assert.match(ask('How should I follow up with Maya?'), /coffee/);
});

step('Graph: Maya is a connection in network mode', () => {
  const g = demo.graph('network');
  assert.ok(g.nodes.some((n) => n.type === 'person' && n.label === 'Maya'));
});

step('Graph: explanations survive the view model; legacy graphs still work', () => {
  const g = demo.graph('matches');
  const edge = g.edges.find((e) => e.kind === 'match' || e.kind === 'connection')!;
  const legacy = buildView(g).people.find((p) => p.id === edge.target)!;
  assert.ok(whySentence(legacy).length);
  edge.explanation = { summary: 'Shared technical interests.', basis: 'v1_proxy', varied: true,
    factors: [{ label: 'technical overlap', contribution: 0.1, share: 0.5 }] };
  const person = buildView(g).people.find((p) => p.id === edge.target)!;
  assert.equal(whySentence(person), edge.explanation.summary);
  assert.equal(person.explanation?.basis, 'v1_proxy');
  assert.equal(person.explanation?.factors[0].share, 0.5);
});

step('Feed: one GitHub card per person saying what they are working on and what to ask', () => {
  const feed = feedMock as FeedResponse;
  const github = feed.items.filter((e) => e.type === 'item' && e.kind === 'github');
  assert.equal(new Set(github.map((e) => e.author.user_id)).size, github.length);
  for (const g of github) {
    assert.ok(g.type === 'item' && g.details && g.title?.startsWith('working on'));
    assert.ok(g.details.summary.length > 40 && g.details.highlights.length >= 2 && g.details.ask);
    assert.ok(DEMO_PEOPLE.some((p) => p.user_id === g.author.user_id));
  }
  const post = feed.items.find((e) => e.type === 'item' && e.kind === 'post');
  assert.ok(post && post.type === 'item' && post.details === null);
});

step('Company counts follow registration, QR check-in, duplicate scans and leaving', () => {
  demo.companySignup({ company_name: 'Count test', contact_name: 'Organizer', contact_email: 'test@example.test', password: 'demo-only' });
  const { event } = demo.createOrgEvent({ name: 'QR count test' });
  const counts = () => {
    const studio = demo.eventStudio(event.id).event;
    const home = demo.myOrg().events.find(e => e.id === event.id)!;
    assert.equal(home.registered, studio.registered);
    assert.equal(home.checked_in, studio.checked_in);
    return [studio.registered, studio.checked_in];
  };
  assert.deepEqual(counts(), [0, 0]);
  const token = demo.eventStudio(event.id).join;
  assert.throws(() => demo.joinEvent(token), /register/);
  demo.registerEvent(event.id);
  assert.deepEqual(counts(), [1, 0]);
  demo.joinEvent(token);
  demo.joinEvent(token);
  assert.deepEqual(counts(), [1, 1]);
  demo.leaveEvent(event.id);
  assert.deepEqual(counts(), [1, 0]);
  demo.enterEventCode(event.join_code!);
  assert.deepEqual(counts(), [1, 1]);
  demo.unregisterEvent(event.id);
  assert.deepEqual(counts(), [0, 0]);
});

console.log(`\n${passed} demo-flow checks passed`);
