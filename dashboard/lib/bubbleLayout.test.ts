import { describe, expect, it } from "vitest";
import map from "../public/mocks/dashboard_event.json";
import { anonymizeMap } from "./api";
import { bubbleLayout, shortLabel } from "./bubbleLayout";
import type { EventMap } from "./types";

const data = anonymizeMap(map as unknown as EventMap);

describe("organizer map layout", () => {
  const W = 1000;
  const H = 680;
  const { pos, bubbles, width, height } = bubbleLayout(data.nodes, data.clusters, W, H, { pad: 35 });

  it("places every node inside the frame", () => {
    expect(pos.size).toBe(data.nodes.length);
    for (const [x, y] of pos.values()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it("members sit inside their community's bubble", () => {
    for (const b of bubbles) {
      for (const n of data.nodes.filter((n) => n.cluster === b.id)) {
        const [x, y] = pos.get(n.id)!;
        expect(Math.hypot(x - b.cx, y - b.cy)).toBeLessThanOrEqual(b.r);
      }
    }
  });

  it("no two communities' bubble+label boxes overlap", () => {
    const box = (b: (typeof bubbles)[number]) => {
      const hw = Math.max(b.r, (shortLabel(b.label).length * 12.2) / 2);
      return { l: b.cx - hw, r: b.cx + hw, t: b.cy - b.r - 58, b: b.cy + b.r };
    };
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const A = box(bubbles[i]);
        const B = box(bubbles[j]);
        const overlap = Math.min(A.r, B.r) > Math.max(A.l, B.l) && Math.min(A.b, B.b) > Math.max(A.t, B.t);
        expect(overlap, `${bubbles[i].label} vs ${bubbles[j].label}`).toBe(false);
      }
    }
  });
});

describe("organizer map anonymity", () => {
  it("nodes carry only anonymous fields and every community has 5+ people", () => {
    for (const n of data.nodes) expect(Object.keys(n).sort()).toEqual(["cluster", "id", "role", "x", "y"].filter((k) => k in n).sort());
    for (const c of data.clusters) if (c.id !== -1) expect(c.size).toBeGreaterThanOrEqual(5);
  });

  it("folds groups under 5 into unclustered", () => {
    const tiny: EventMap = {
      nodes: [{ id: "n1", x: 0, y: 0, cluster: 9, role: "student" }],
      clusters: [{ id: 9, label: "rare thing", size: 3 }],
      edges: [],
      gaps: [{ clusters: [9, 1], expected: 2, actual: 0, gap: 2, ratio: 0 }],
    };
    const out = anonymizeMap({ ...tiny, nodes: [{ ...tiny.nodes[0], name: "Leak" } as never] });
    expect(out.nodes[0].cluster).toBe(-1);
    expect(out.clusters).toHaveLength(0);
    expect(out.gaps).toHaveLength(0);
    expect(JSON.stringify(out)).not.toContain("Leak");
  });
});
