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
  top: boolean; // green ring: top match (or someone Open to Meet right now)
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
        top: p.highlight || p.open_to_meet,
        openToMeet: p.open_to_meet,
        shared: shared.length ? shared : p.why ?? (p.top_topic ? [p.top_topic] : []),
        metAt: p.connected_at,
        howMet: p.how_met ?? (p.connected ? 'in_person' : null),
      };
    })
    .sort((a, b) => b.score - a.score);

  const counts = new Map<string, number>();
  people.forEach((p) => p.shared.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const topics: Topic[] = [...topicById.values()]
    .filter((t) => (counts.get(t.label) ?? 0) > 0)
    .map((t) => ({ id: t.id, label: t.label, facet: t.facet, count: counts.get(t.label) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { people, topics, synthetic: Boolean(g.synthetic) };
}

/** "You both have reinforcement learning, time series analysis and rock climbing in common." */
export function whySentence(p: Person): string {
  const t = p.shared.slice(0, 3);
  if (!t.length) return 'Your profiles overlap.';
  const list = t.length === 1 ? t[0] : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
  return `You both have ${list} in common.`;
}

export const RING_LABELS: Record<GraphMode, [string, string, string]> = {
  matches: ['Best matches', 'Good matches', 'Some overlap'],
  network: ['Most in common', 'Some in common', 'A little in common'],
};

export interface Placed extends Person {
  ring: 0 | 1 | 2;
  x: number;
  y: number;
}

/**
 * Three rings, inner = strongest. Top matches (green ring) go on the inner ring; the rest fill the middle
 * then outer ring by score. People on a ring are spread evenly, grouped by their main shared topic so
 * similar people sit together. Capped by ring capacity so dots never overlap.
 */
export function placeOnRings(people: Person[], size: number, mode: GraphMode): { placed: Placed[]; radii: number[]; hidden: number } {
  const c = size / 2;
  const radii = [size * 0.2, size * 0.33, size * 0.46];
  const minGap = 38; // px between dot centers (dot is ~32px wide)
  const cap = radii.map((r) => Math.max(4, Math.floor((2 * Math.PI * r) / minGap)));

  const strength = (p: Person) => (mode === 'network' ? p.shared.length + p.score : p.score);
  const sorted = [...people].sort((a, b) => strength(b) - strength(a));
  const rings: Person[][] = [[], [], []];
  const innerQuota = mode === 'matches' ? sorted.filter((p) => p.top).length || Math.ceil(sorted.length * 0.2) : Math.ceil(sorted.length * 0.25);
  for (const p of sorted) {
    const want = rings[0].length < Math.min(innerQuota, cap[0]) ? 0 : rings[1].length < cap[1] ? 1 : 2;
    if (want === 2 && rings[2].length >= cap[2]) continue;
    rings[want].push(p);
  }
  const placed: Placed[] = [];
  rings.forEach((ring, ri) => {
    const ordered = [...ring].sort((a, b) => (a.shared[0] ?? '').localeCompare(b.shared[0] ?? '') || b.score - a.score);
    const offset = ri * 0.4 - Math.PI / 2; // start at the top, stagger rings so dots don't line up
    ordered.forEach((p, i) => {
      const a = offset + (i / Math.max(1, ordered.length)) * 2 * Math.PI;
      placed.push({ ...p, ring: ri as 0 | 1 | 2, x: c + radii[ri] * Math.cos(a), y: c + radii[ri] * Math.sin(a) });
    });
  });
  return { placed, radii, hidden: people.length - placed.length };
}
