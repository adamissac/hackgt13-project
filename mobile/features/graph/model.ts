// Turns GET /graph (api.md 26) into something a person can read at a glance:
// people on three rings around you (inner = stronger match), topics you share as filters,
// and one plain sentence per person saying why. Pure functions: no React, easy to test.
import type { Facet, GraphMode, GraphPerson, GraphResponse } from '@/lib/api';

export interface Person {
  id: string;
  userId: string; // for /match/[id]
  name: string;
  first: string;
  role: 'student' | 'recruiter';
  score: number;
  top: boolean; // green ring: top match
  openToMeet: boolean;
  shared: string[]; // topics you both have, strongest first
  metAt: string | null;
  howMet: 'in_person' | 'invite' | null;
}

export interface Topic {
  id: string;
  label: string;
  facet: Facet;
  count: number; // people in view who share it with you
}

export interface GraphView {
  people: Person[];
  topics: Topic[];
  synthetic: boolean;
}

export function buildView(g: GraphResponse): GraphView {
  const me = g.nodes.find((n) => n.type === 'self')?.id ?? 'me';
  const topicById = new Map(g.nodes.filter((n) => n.type === 'topic').map((t) => [t.id, t as Extract<typeof t, { type: 'topic' }>]));
  const mine = new Set(g.edges.filter((e) => e.source === me && e.kind === 'has_topic').map((e) => e.target));
  const personTopics = new Map<string, { label: string; w: number }[]>();
  for (const e of g.edges) {
    if (e.kind !== 'has_topic' || e.source === me) continue;
    const t = topicById.get(e.target);
    if (!t) continue;
    // a topic node in /graph is already shared with me; keep it if I hold it or if my edges are absent
    if (mine.size && !mine.has(t.id)) continue;
    personTopics.set(e.source, [...(personTopics.get(e.source) ?? []), { label: t.label, w: e.weight }]);
  }
  const people: Person[] = g.nodes
    .filter((n): n is GraphPerson => n.type === 'person')
    .map((p) => {
      const shared = (personTopics.get(p.id) ?? []).sort((a, b) => b.w - a.w).map((t) => t.label);
      const name = p.name ?? p.label;
      return {
        id: p.id,
        userId: p.id.replace(/^u_/, ''),
        name,
        first: name.split(/\s+/)[0] ?? name,
        role: p.role ?? 'student',
        score: p.score,
        top: p.highlight,
        openToMeet: p.open_to_meet,
        shared: shared.length ? shared : p.why ?? (p.top_topic ? [p.top_topic] : []),
        metAt: p.connected_at,
        howMet: p.how_met ?? (p.connected ? 'in_person' : null),
      };
    })
    .sort((a, b) => b.score - a.score);

  const myWeight = new Map(g.edges.filter((e) => e.source === me && e.kind === 'has_topic').map((e) => [e.target, e.weight]));
  const counts = new Map<string, number>();
  people.forEach((p) => p.shared.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const topics: Topic[] = [...topicById.values()]
    .filter((t) => (counts.get(t.label) ?? 0) > 0)
    .map((t) => ({ id: t.id, label: t.label, facet: t.facet, count: counts.get(t.label) ?? 0 }))
    // your strongest interests first (a topic everyone shares, like "python", says less)
    .sort((a, b) => (myWeight.get(b.id) ?? 0) - (myWeight.get(a.id) ?? 0) || a.count - b.count || a.label.localeCompare(b.label));
  return { people, topics, synthetic: Boolean(g.synthetic) };
}

/** "You both have reinforcement learning, time series analysis and rock climbing in common." */
export function whySentence(p: Person): string {
  const t = p.shared.slice(0, 3);
  if (!t.length) return 'Your profiles overlap.';
  const list = t.length === 1 ? t[0] : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
  return `You both have ${list} in common.`;
}
