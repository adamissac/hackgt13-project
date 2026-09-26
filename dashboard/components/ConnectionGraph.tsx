"use client";

// Loaded only on the client (see GraphCanvas.tsx) so the ref reaches ForceGraph2D directly.
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceCollide } from "d3-force-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clusterColor, drawShape, FACET_SHAPE, type Palette } from "@/lib/theme";
import { selfId, type GraphEdge, type GraphNode, type GraphPayload } from "@/lib/types";

type Extra = { r: number };
type N = NodeObject<GraphNode & Extra>;
type L = LinkObject<GraphNode & Extra, GraphEdge>;

export type ColorBy = "facet" | "cluster";

export interface ConnectionGraphProps {
  data: GraphPayload;
  palette: Palette;
  colorBy: ColorBy;
  clusterSlots: Map<number, number>; // cluster id -> palette slot (0-2); others render as "other"
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReady?: (canvas: HTMLCanvasElement | null) => void;
}

function radius(n: GraphNode): number {
  if (n.type === "self") return 15;
  if (n.type === "person") {
    // matches: size by score; connections: size by number of shared topics (MASTER_SPEC 3.12)
    const v = n.connected ? Math.min(1, (n.shared_count ?? 1) / 5) : Math.max(0, Math.min(1, n.score));
    return 5 + 9 * v;
  }
  return 6;
}

function initials(n: { label: string; name?: string }) {
  return (n.name ?? n.label)
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

// deterministic jitter in [-0.5, 0.5) from an id (render must stay pure)
function jitter(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

const endId = (e: unknown) => (typeof e === "object" && e !== null ? String((e as { id?: unknown }).id) : String(e));

export default function ConnectionGraph({
  data,
  palette,
  colorBy,
  clusterSlots,
  width,
  height,
  selectedId,
  onSelect,
  onReady,
}: ConnectionGraphProps) {
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const [nodeCache] = useState(() => new Map<string, N>());
  const fitted = useRef(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const me = selfId(data);

  // Stable node objects keyed by id: positions survive filters, the timeline, and /graph/expand merges.
  const graphData = useMemo(() => {
    const fresh: N[] = [];
    const nodes: N[] = data.nodes.map((n) => {
      const prev = nodeCache.get(n.id);
      const node = prev ? Object.assign(prev, n, { r: radius(n) }) : ({ ...n, r: radius(n) } as N);
      if (!prev) fresh.push(node);
      if (n.type === "self") {
        node.fx = 0;
        node.fy = 0;
      }
      nodeCache.set(n.id, node);
      return node;
    });
    // new nodes (e.g. from expand) start next to an existing neighbor instead of at the origin
    for (const node of fresh) {
      const e = data.edges.find((x) => (x.source === node.id || x.target === node.id) && x.kind === "has_topic");
      const other = e && nodeCache.get(e.source === node.id ? e.target : e.source);
      if (other && other !== node && other.x !== undefined && other.y !== undefined) {
        node.x = other.x + jitter(String(node.id), 1) * 30;
        node.y = other.y + jitter(String(node.id), 2) * 30;
      }
    }
    const links: L[] = data.edges.map((e) => ({ ...e }));
    return { nodes, links };
  }, [data, nodeCache]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of data.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [data]);

  const focusId = selectedId ?? hoverId;
  const isLit = useCallback(
    (id: string) => !focusId || id === focusId || id === me || !!neighbors.get(focusId)?.has(id),
    [focusId, neighbors, me],
  );

  // Forces (MASTER_SPEC 10): link distance ~ 1/weight, charge -120 people / -60 topics, collide = r + 4, self pinned.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const link = g.d3Force("link");
    link?.distance?.((l: L) => {
      const w = Math.max(0.05, Math.min(1, l.weight ?? 0.5));
      if (l.kind !== "has_topic") return 70 + 170 * (1 - w);
      return endId(l.source) === me ? 95 : 30 + 45 * (1 - w);
    });
    link?.strength?.((l: L) => (l.kind === "has_topic" ? (endId(l.source) === me ? 0.25 : 0.45) : 0.3));
    g.d3Force("charge")?.strength?.((n: N) => (n.type === "topic" ? -60 : n.type === "self" ? -200 : -120));
    g.d3Force("collide", forceCollide((n: N) => n.r + (n.type === "topic" ? 14 : 4)));
    g.d3ReheatSimulation();
  }, [graphData, me]);

  useEffect(() => {
    onReady?.(wrap.current?.querySelector("canvas") ?? null);
  }, [onReady, width, height]);

  const personFill = useCallback(
    (n: N & { type: "person" }) => {
      if (colorBy === "cluster") {
        const slot = n.cluster === null ? undefined : clusterSlots.get(n.cluster);
        return clusterColor(palette, slot);
      }
      return n.role === "recruiter" ? palette.personRecruiter : palette.person;
    },
    [colorBy, clusterSlots, palette],
  );

  const drawNode = useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const lit = isLit(String(node.id));
      const px = (v: number) => v / scale; // screen px -> graph units
      ctx.globalAlpha = lit ? 1 : 0.18;
      const labelSize = px(Math.max(11, Math.min(15, 12 * Math.sqrt(scale))));
      const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, sans-serif`;

      if (node.type === "self") {
        ctx.beginPath();
        ctx.arc(x, y, node.r, 0, 2 * Math.PI);
        ctx.fillStyle = palette.self;
        ctx.fill();
        ctx.fillStyle = palette.selfInk;
        ctx.font = font(600, Math.max(px(11), 7));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label || "You", x, y);
      } else if (node.type === "person") {
        const selected = node.id === selectedId;
        if (node.highlight || node.open_to_meet) {
          ctx.beginPath();
          ctx.arc(x, y, node.r + px(4), 0, 2 * Math.PI);
          ctx.strokeStyle = palette.highlight;
          ctx.lineWidth = px(2.5);
          ctx.setLineDash(node.highlight ? [] : [px(3), px(2.5)]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.arc(x, y, node.r, 0, 2 * Math.PI);
        ctx.fillStyle = personFill(node);
        ctx.fill();
        ctx.lineWidth = px(2);
        ctx.strokeStyle = palette.surface;
        ctx.stroke();
        if (selected) {
          ctx.beginPath();
          ctx.arc(x, y, node.r + px(8), 0, 2 * Math.PI);
          ctx.strokeStyle = palette.ink;
          ctx.lineWidth = px(1.5);
          ctx.stroke();
        }
        if (node.r * scale >= 11) {
          ctx.fillStyle = palette.surface;
          ctx.font = font(600, node.r * 0.8);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initials(node), x, y + node.r * 0.04);
        }
        const focused = selected || node.id === hoverId;
        if ((focused || node.highlight || scale > 2.2) && lit) {
          const top = y + node.r + px(node.highlight || node.open_to_meet ? 9 : 5);
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.lineWidth = px(3);
          ctx.strokeStyle = palette.surface;
          ctx.font = font(600, labelSize);
          ctx.strokeText(node.label, x, top);
          ctx.fillStyle = palette.ink;
          ctx.fillText(node.label, x, top);
          if (focused && node.top_topic) {
            ctx.font = font(400, labelSize * 0.86);
            ctx.strokeText(node.top_topic, x, top + labelSize * 1.15);
            ctx.fillStyle = palette.inkSecondary;
            ctx.fillText(node.top_topic, x, top + labelSize * 1.15);
          }
        }
      } else {
        drawShape(ctx, FACET_SHAPE[node.facet], x, y, node.r);
        ctx.fillStyle = colorBy === "facet" ? palette.facet[node.facet] : palette.muted;
        ctx.fill();
        ctx.lineWidth = px(1.5);
        ctx.strokeStyle = palette.surface;
        ctx.stroke();
        if (lit && (scale > 0.45 || node.id === selectedId || node.id === hoverId)) {
          ctx.font = font(500, labelSize * 0.9);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.lineWidth = px(3);
          ctx.strokeStyle = palette.surface;
          ctx.strokeText(node.label, x + node.r + px(4), y);
          ctx.fillStyle = palette.inkSecondary;
          ctx.fillText(node.label, x + node.r + px(4), y);
        }
      }
      ctx.globalAlpha = 1;
    },
    [palette, isLit, selectedId, hoverId, personFill, colorBy],
  );

  const paintPointer = useCallback((node: N, color: string, ctx: CanvasRenderingContext2D, scale: number) => {
    // hit target bigger than the mark (touch friendly)
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.r + 10 / scale, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const linkColor = useCallback(
    (l: L) => {
      const s = endId(l.source);
      const t = endId(l.target);
      const lit = !focusId || (selectedId ? s === focusId || t === focusId : isLit(s) && isLit(t));
      if (!lit) return palette.hairline;
      if (l.kind === "has_topic") return palette.link;
      // person <-> you: dominant shared facet (MASTER_SPEC 3.12)
      if (colorBy === "facet" && l.facet) return palette.facet[l.facet] + "b3";
      return palette.linkStrong;
    },
    [palette, focusId, isLit, selectedId, colorBy],
  );

  return (
    <div ref={wrap} style={{ width, height }}>
      <ForceGraph2D<GraphNode & Extra, GraphEdge>
        ref={fg}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor={palette.surface}
        nodeId="id"
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={paintPointer}
        linkColor={linkColor}
        linkWidth={(l: L) => (l.kind === "has_topic" ? 0.5 + 1.5 * l.weight : 0.8 + 3 * l.weight)}
        linkLineDash={(l: L) => (l.kind === "match" ? [4, 3] : null)}
        onNodeHover={(n: N | null) => setHoverId(n ? String(n.id) : null)}
        onNodeClick={(n: N) => onSelect(String(n.id) === selectedId ? null : String(n.id))}
        onBackgroundClick={() => onSelect(null)}
        cooldownTicks={180}
        d3VelocityDecay={0.32}
        minZoom={0.4}
        maxZoom={6}
        onEngineStop={() => {
          if (!fitted.current) {
            fitted.current = true;
            fg.current?.zoomToFit(500, 64);
          }
        }}
      />
    </div>
  );
}
