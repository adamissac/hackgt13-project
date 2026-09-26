import type { MapCluster, MapNode } from "./types";

export type Pt = [number, number];

export interface Bubble extends MapCluster {
  cx: number;
  cy: number;
  r: number;
}

export interface BubbleLayout {
  pos: Map<string, Pt>;
  bubbles: Bubble[];
  dot: number;
  width: number; // viewBox size: grows to fit the relaxed layout so text never shrinks under bubbles
  height: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Organizer map layout. UMAP places the communities (the meaningful, global structure); each community is
 * drawn as a bubble sized by headcount with members spread evenly inside (phyllotaxis), then bubbles are
 * relaxed apart so labels never collide. Positions inside a bubble carry no meaning (anonymous dots).
 */
export function bubbleLayout(
  nodes: MapNode[],
  clusters: MapCluster[],
  W: number,
  H: number,
  opts: { pad?: number; labelGap?: number; charW?: number } = {},
): BubbleLayout {
  const pad = opts.pad ?? 40;
  const labelGap = opts.labelGap ?? 58; // room above each bubble for its two label lines
  const charW = opts.charW ?? 12.2; // ~0.55em at the 22px label size
  if (nodes.length === 0) return { pos: new Map(), bubbles: [], dot: 5, width: W, height: H };

  // 1. UMAP coords -> frame. UMAP axes are arbitrary, so each axis is stretched to fill the frame's aspect.
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (W - 2 * pad) / (x1 - x0 || 1);
  const sy = (H - 2 * pad) / (y1 - y0 || 1);
  const raw = new Map<string, Pt>(nodes.map((n) => [n.id, [pad + (n.x - x0) * sx, pad + (n.y - y0) * sy]]));

  // 2. bodies: one per real cluster (bubble) + one per unclustered dot
  const members = new Map<number, MapNode[]>();
  nodes.forEach((n) => members.set(n.cluster, [...(members.get(n.cluster) ?? []), n]));
  const labelW = (c: MapCluster) => shortLabel(c.label).length * charW;
  type Body = { id: string; x: number; y: number; ox: number; oy: number; r: number; top: number; halfW: number };
  const bodies: Body[] = [];
  const real = clusters.filter((c) => c.id !== -1 && (members.get(c.id)?.length ?? 0) > 0);
  for (const c of real) {
    const m = members.get(c.id)!;
    const cx = m.reduce((a, n) => a + raw.get(n.id)![0], 0) / m.length;
    const cy = m.reduce((a, n) => a + raw.get(n.id)![1], 0) / m.length;
    const r = 12 + 7.5 * Math.sqrt(m.length);
    bodies.push({ id: `c${c.id}`, x: cx, y: cy, ox: cx, oy: cy, r, top: labelGap, halfW: labelW(c) / 2 });
  }
  for (const n of members.get(-1) ?? []) {
    const [x, y] = raw.get(n.id)!;
    bodies.push({ id: n.id, x, y, ox: x, oy: y, r: 7, top: 0, halfW: 0 });
  }

  // 3. relax: each body is a box (bubble + label above it). Push overlapping boxes apart along the axis
  //    of least overlap, with a weak pull back toward the UMAP position so the global structure survives.
  const GAP = 16;
  const box = (b: Body) => {
    const hw = Math.max(b.r, b.halfW);
    return { l: b.x - hw, r: b.x + hw, t: b.y - b.r - b.top, b: b.y + b.r };
  };
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const A = box(bodies[i]);
        const B = box(bodies[j]);
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l) + GAP;
        const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t) + GAP;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const a = bodies[i];
        const b = bodies[j];
        if (ox < oy * 1.6) { // prefer sideways moves: frames are wider than tall
          const dir = b.x >= a.x ? 1 : -1;
          a.x -= (dir * ox) / 2;
          b.x += (dir * ox) / 2;
        } else {
          const dir = b.y >= a.y ? 1 : -1;
          a.y -= (dir * oy) / 2;
          b.y += (dir * oy) / 2;
        }
      }
    }
    if (!moved && it > 50) break;
    for (const b of bodies) {
      b.x += (b.ox - b.x) * 0.005;
      b.y += (b.oy - b.y) * 0.005;
    }
  }

  // 4. frame: never shrink (labels are fixed-size text); grow the viewBox to fit and center the layout
  const minX = Math.min(...bodies.map((b) => b.x - Math.max(b.r, b.halfW)));
  const maxX = Math.max(...bodies.map((b) => b.x + Math.max(b.r, b.halfW)));
  const minY = Math.min(...bodies.map((b) => b.y - b.r - b.top));
  const maxY = Math.max(...bodies.map((b) => b.y + b.r));
  const width = Math.max(W, maxX - minX + 2 * pad);
  const height = Math.max(H, maxY - minY + 2 * pad);
  const s = 1;
  const ox = (width - (maxX - minX)) / 2 - minX;
  const oy = (height - (maxY - minY)) / 2 - minY;
  const tx = (x: number) => ox + x * s;
  const ty = (y: number) => oy + y * s;

  // 5. members inside each bubble (sunflower spiral), unclustered dots where they settled
  const dot = 5;
  const pos = new Map<string, Pt>();
  const bubbles: Bubble[] = [];
  for (const c of real) {
    const b = bodies.find((x) => x.id === `c${c.id}`)!;
    const m = [...members.get(c.id)!].sort((p, q) => raw.get(p.id)![0] - raw.get(q.id)![0]);
    const R = b.r * s;
    const step = (R - dot - 3) / Math.sqrt(Math.max(1, m.length));
    m.forEach((n, k) => {
      const rr = step * Math.sqrt(k + 0.5);
      pos.set(n.id, [tx(b.x) + rr * Math.cos(k * GOLDEN), ty(b.y) + rr * Math.sin(k * GOLDEN)]);
    });
    bubbles.push({ ...c, cx: tx(b.x), cy: ty(b.y), r: R });
  }
  for (const n of members.get(-1) ?? []) {
    const b = bodies.find((x) => x.id === n.id)!;
    pos.set(n.id, [tx(b.x), ty(b.y)]);
  }
  return { pos, bubbles, dot, width, height };
}

/** First two c-TF-IDF terms, title-cased: "embedded systems + control systems + ros" -> "Embedded Systems + Control Systems". */
export function shortLabel(label: string): string {
  return label
    .split(" + ")
    .slice(0, 2)
    .join(" + ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
