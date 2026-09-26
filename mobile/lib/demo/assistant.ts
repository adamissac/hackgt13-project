// Demo-mode assistant. Live mode calls POST /assistant/chat (Claude with server-scoped tools).
// This answers from the demo backend's data so the assistant is demoable offline, with the same
// rules: only people you can already see, never anyone's connections or a "no".
import type { AssistantMessage } from '../api';
import { snapshot } from './backend';
import { DEMO_MY_INTERESTS, type DemoPerson } from './people';

const TOPIC_WORDS: { words: RegExp; topics: string[]; label: string }[] = [
  { words: /\brag\b|retrieval/i, topics: ['retrieval-augmented generation'], label: 'RAG and retrieval' },
  { words: /quant|trading|finance|fintech/i, topics: ['reinforcement learning', 'statistics'], label: 'quant and trading' },
  { words: /\bml\b|machine learning|\bai\b|deep learning|pytorch/i, topics: ['retrieval-augmented generation', 'reinforcement learning', 'AI internships'], label: 'AI and machine learning' },
  { words: /intern|job|hiring|recruit/i, topics: ['AI internships'], label: 'internships' },
  { words: /front ?end|react|design|ui\b|ux/i, topics: ['React Native'], label: 'frontend and design' },
  { words: /reinforcement|\brl\b/i, topics: ['reinforcement learning'], label: 'reinforcement learning' },
  { words: /edu|teach|tutor|student/i, topics: ['education technology'], label: 'education technology' },
  { words: /access|hci|research/i, topics: ['education technology'], label: 'HCI and research' },
];

const firstName = (p: DemoPerson) => p.name.split(' ')[0];
const shared = (p: DemoPerson, n = 3) => p.shared.slice(0, n).map((s) => s.name).join(', ');

function visiblePeople() {
  return snapshot()
    .people.filter((x) => x.stage !== 'DECLINED')
    .map((x) => x.person)
    .sort((a, b) => b.score - a.score);
}

function named(text: string): DemoPerson | undefined {
  const lower = text.toLowerCase();
  return visiblePeople().find((p) => lower.includes(firstName(p).toLowerCase()) || lower.includes(p.name.toLowerCase()));
}

function lastNamed(messages: AssistantMessage[]): DemoPerson | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const p = named(messages[i].content);
    if (p) return p;
  }
  return undefined;
}

export function demoAssistantReply(messages: AssistantMessage[]): string {
  const q = messages[messages.length - 1]?.content ?? '';
  const people = visiblePeople();
  const who = named(q) ?? (/\b(her|him|them|they|she|he)\b/i.test(q) ? lastNamed(messages.slice(0, -1)) : undefined);
  const open = snapshot().openToMeet;

  if (who && /icebreaker|ask|say|talk about|open(er)?|start/i.test(q)) {
    return `Here’s a good way to start with ${firstName(who)}:\n\n“${who.openers[0]}”\n\n${who.openers[1] ? `Another option: “${who.openers[1]}”` : ''}`.trim();
  }
  if (who && /why|match|common|share|overlap/i.test(q)) {
    return `You and ${firstName(who)} are a ${Math.round(who.score * 100)}% match. ${who.why}\n\nWhat you share: ${shared(who, 4)}.`;
  }
  if (who) {
    return `${who.name}: ${who.headline} (${who.school}). ${who.bio}\n\nLooking for: ${who.seeking}.\nYou share: ${shared(who)}.`;
  }

  const topic = TOPIC_WORDS.find((t) => t.words.test(q));
  if (topic) {
    const hits = people.filter(
      (p) =>
        p.shared.some((s) => topic.topics.includes(s.name)) ||
        topic.words.test(`${p.headline} ${p.bio} ${p.skills.join(' ')} ${p.seeking} ${p.offering}`),
    );
    if (hits.length === 0) return `I don’t see anyone here working on ${topic.label} yet. Try turning on Open to Meet so more people show up.`;
    const lines = hits.slice(0, 3).map((p) => `• ${p.name} (${Math.round(p.score * 100)}% match): ${p.headline}. You share ${shared(p, 2)}.`);
    return `People here into ${topic.label}:\n\n${lines.join('\n')}\n\n${firstName(hits[0])} is your best bet. Ask me “What should I ask ${firstName(hits[0])}?” for an icebreaker.`;
  }

  if (/who|should i|meet|talk|best|strongest|nearby|around/i.test(q)) {
    const top = people[0];
    const next = people.slice(1, 3).map((p) => `${firstName(p)} (${p.shared[0]?.name})`).join(' and ');
    return `${top.name} is your strongest match here at ${Math.round(top.score * 100)}%. ${top.why}\n\n${
      open ? `${firstName(top)} is very close right now.` : 'Turn on Open to Meet to see who’s close by.'
    }\n\nAlso worth meeting: ${next}.`;
  }

  if (/me|my profile|about me|my interests/i.test(q)) {
    return `From what you shared, your strongest interests are ${DEMO_MY_INTERESTS.slice(0, 4)
      .map((i) => i.name)
      .join(', ')}. That’s why people working on RAG and AI internships rank highest for you.`;
  }

  return 'I can help you figure out who to meet and what to talk about. Try “Who should I meet?”, “Who here works on RAG?”, or “What should I ask Maya?”';
}
