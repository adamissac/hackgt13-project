"use client";

// Loaded only on the client (see GraphCanvas.tsx) so the ref reaches ForceGraph2D directly.
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceCollide } from "d3-force-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawShape, FACET_SHAPE, type Palette } from "@/lib/theme";
import type { GraphLink, GraphNode, GraphPayload } from "@/lib/types";

type N = NodeObject<GraphNode & { r: number }>;
type L = LinkObject<GraphNode & { r: number }, GraphLink>;

export interface ConnectionGraphProps {
  data: GraphPayload;
  palette: Palette;
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReady?: (canvas: HTMLCanvasElement | null) => void;
}

function radius(n: GraphNode): number {
  if (n.type === "self") return 15;
  if (n.type === "person") return 5 + 9 * Math.max(0, Math.min(1, n.score));
  return 6;
}

function firstName(label: string) {
  return label.split(" ")[0];
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

const endId = (e: unknown) => (typeof e === "object" && e !== null ? String((e as { id?: unknown }).id) : String(e));

export default function ConnectionGraph({
  data,
  palette,
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

  // Stable node objects keyed by id: positions survive filter changes and future /graph/expand merges.
  const graphData = useMemo(() => {
    const cache = nodeCache;
    const nodes: N[] = data.nodes.map((n) => {
      const prev = cache.get(n.id);
      const node = prev ? Object.assign(prev, n, { r: radius(n) }) : ({ ...n, r: radius(n) } as N);
      if (n.type === "self") {
        node.fx = 0;
        node.fy = 0;
      }
      cache.set(n.id, node);
      return node;
    });
    const links: L[] = data.links.map((l) => ({ ...l }));
    return { nodes, links };
  }, [data, nodeCache]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of data.links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [data]);

  const focusId = selectedId ?? hoverId;
  const isLit = useCallback(
    (id: string) => !focusId || id === focusId || id === data.self_id || !!neighbors.get(focusId)?.has(id),
    [focusId, neighbors, data.self_id],
  );

  // Forces (MASTER_SPEC 10): link distance ~ 1/weight, charge by node type, collide = r + 4.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const link = g.d3Force("link");
    link?.distance?.((l: L) => {
      const w = Math.max(0.05, Math.min(1, l.weight ?? 0.5));
      if (l.kind !== "interest") return 70 + 170 * (1 - w);
      return endId(l.source) === data.self_id ? 95 : 30 + 45 * (1 - w);
    });
    link?.strength?.((l: L) => (l.kind === "interest" ? (endId(l.source) === data.self_id ? 0.25 : 0.45) : 0.3));
    g.d3Force("charge")?.strength?.((n: N) => (n.type === "topic" ? -60 : n.type === "self" ? -200 : -120));
    g.d3Force("collide", forceCollide((n: N) => n.r + (n.type === "topic" ? 14 : 4)));
    g.d3ReheatSimulation();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __fg?: unknown }).__fg = { g, graphData };
  }, [graphData, data.self_id]);

  useEffect(() => {
    onReady?.(wrap.current?.querySelector("canvas") ?? null);
  }, [onReady, width, height]);

  const drawNode = useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const lit = isLit(String(node.id));
      const px = (v: number) => v / scale; // screen px -> graph units
      ctx.globalAlpha = lit ? 1 : 0.18;
      const labelSize = px(Math.max(11, Math.min(15, 12 * Math.sqrt(scale))));

      if (node.type === "self") {
        ctx.beginPath();
        ctx.arc(x, y, node.r, 0, 2 * Math.PI);
        ctx.fillStyle = palette.self;
        ctx.fill();
        ctx.fillStyle = palette.selfInk;
        ctx.font = `600 ${Math.max(px(11), 7)}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("You", x, y);
      } else if (node.type === "person") {
        const selected = node.id === selectedId;
        // ring first so the 2px surface gap separates it from the fill
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
        ctx.fillStyle = node.role === "recruiter" ? palette.personRecruiter : palette.person;
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
          ctx.font = `600 ${node.r * 0.8}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initials(node.label), x, y + node.r * 0.04);
        }
        const focused = selected || node.id === hoverId;
        const showLabel = focused || node.highlight || scale > 2.2;
        if (showLabel && lit) {
          const top = y + node.r + px(node.highlight || node.open_to_meet ? 9 : 5);
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.font = `600 ${labelSize}px system-ui, -apple-system, sans-serif`;
          ctx.lineWidth = px(3);
          ctx.strokeStyle = palette.surface;
          ctx.strokeText(firstName(node.label), x, top);
          ctx.fillStyle = palette.ink;
          ctx.fillText(firstName(node.label), x, top);
          if (focused) {
            ctx.font = `400 ${labelSize * 0.86}px system-ui, -apple-system, sans-serif`;
            ctx.strokeText(node.top_topic, x, top + labelSize * 1.15);
            ctx.fillStyle = palette.inkSecondary;
            ctx.fillText(node.top_topic, x, top + labelSize * 1.15);
          }
        }
      } else {
        const color = palette.facet[node.facet];
        drawShape(ctx, FACET_SHAPE[node.facet], x, y, node.r);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = px(1.5);
        ctx.strokeStyle = palette.surface;
        ctx.stroke();
        const showLabel = lit && (scale > 0.45 || node.id === selectedId || node.id === hoverId);
        if (showLabel) {
          ctx.font = `500 ${labelSize * 0.9}px system-ui, -apple-system, sans-serif`;
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
    [palette, isLit, selectedId, hoverId],
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
      const lit = !focusId || isLit(endId(l.source)) && isLit(endId(l.target)) &&
        (endId(l.source) === focusId || endId(l.target) === focusId || !selectedId);
      if (!lit) return palette.hairline;
      if (l.kind === "interest" && l.facet) return palette.facet[l.facet] + "66";
      return palette.linkStrong;
    },
    [palette, focusId, isLit, selectedId],
  );

  return (
    <div ref={wrap} style={{ width, height }}>
      <ForceGraph2D<GraphNode & { r: number }, GraphLink>
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
        linkWidth={(l: L) => (l.kind === "interest" ? 0.6 + 1.4 * l.weight : 0.8 + 2 * l.weight)}
        linkLineDash={(l: L) => (l.kind === "suggested" ? [4, 3] : null)}
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
