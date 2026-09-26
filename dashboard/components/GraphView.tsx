"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import { fetchGraph } from "@/lib/api";
import { postToApp, useEmbeddedToken } from "@/lib/auth";
import { FACET_GLYPH, usePalette } from "@/lib/theme";
import {
  FACETS,
  type Facet,
  type GraphMode,
  type GraphPayload,
  type PersonNode,
  type TopicNode,
} from "@/lib/types";

type Status = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; source: "live" | "mock" };
type Result = { key: string; data: GraphPayload; source: "live" | "mock" } | { key: string; error: string };

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function filterGraph(g: GraphPayload, minScore: number, facet: Facet | null, query: string): GraphPayload {
  const q = query.trim().toLowerCase();
  const topicOk = (t: TopicNode) => !facet || t.facet === facet;
  const topics = new Map(g.nodes.filter((n): n is TopicNode => n.type === "topic").map((t) => [t.id, t]));
  const personTopics = new Map<string, string[]>();
  for (const l of g.links) {
    if (topics.has(l.target)) personTopics.set(l.source, [...(personTopics.get(l.source) ?? []), l.target]);
  }
  const keep = new Set<string>();
  for (const n of g.nodes) {
    if (n.type === "self") keep.add(n.id);
    else if (n.type === "topic" && topicOk(n)) keep.add(n.id);
    else if (n.type === "person") {
      if (n.score < minScore) continue;
      if (facet && !(personTopics.get(n.id) ?? []).some((t) => topicOk(topics.get(t)!))) continue;
      if (q && !n.label.toLowerCase().includes(q) && !n.topics.some((t) => t.includes(q))) continue;
      keep.add(n.id);
    }
  }
  return {
    ...g,
    nodes: g.nodes.filter((n) => keep.has(n.id)),
    links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  };
}

export default function GraphView({ eventId = 1, initialMode = "matches" }: { eventId?: number; initialMode?: GraphMode }) {
  const token = useEmbeddedToken();
  const palette = usePalette();
  const [mode, setMode] = useState<GraphMode>(initialMode);
  const [result, setResult] = useState<Result | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [facet, setFacet] = useState<Facet | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [stageRef, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const key = `${mode}|${eventId}|${token ?? ""}|${reload}`;
  useEffect(() => {
    const ac = new AbortController();
    fetchGraph({ mode, eventId, token, signal: ac.signal })
      .then(({ data, source }) => setResult({ key, data, source }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setResult({ key, error: e instanceof Error ? e.message : "Couldn't load the graph" });
      });
    return () => ac.abort();
  }, [key, mode, eventId, token]);

  const current = result?.key === key ? result : null;
  const raw = current && "data" in current ? current.data : null;
  const status: Status = !current
    ? { kind: "loading" }
    : "error" in current
      ? { kind: "error", message: current.error }
      : { kind: "ready", source: current.source };

  const view = useMemo(() => (raw ? filterGraph(raw, minScore, facet, query) : null), [raw, minScore, facet, query]);
  const people = useMemo(
    () =>
      (view?.nodes.filter((n): n is PersonNode => n.type === "person") ?? []).sort((a, b) => b.score - a.score),
    [view],
  );
  const selected = view?.nodes.find((n) => n.id === selectedId) ?? null;
  const topicFacet = useMemo(() => {
    const m = new Map<string, Facet>();
    raw?.nodes.forEach((n) => n.type === "topic" && m.set(n.label, n.facet));
    return m;
  }, [raw]);

  const onReady = useCallback((c: HTMLCanvasElement | null) => {
    canvasRef.current = c;
  }, []);

  function exportPng() {
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL("image/png");
    if (!postToApp({ type: "export_png", dataUrl })) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `connection-graph-${mode}.png`;
      a.click();
    }
  }

  const Chip = ({ name }: { name: string }) => {
    const f = topicFacet.get(name);
    return (
      <span className="chip">
        {f && (
          <span className="chip-mark" style={{ color: palette.facet[f] }} aria-label={f}>
            {FACET_GLYPH[f]}
          </span>
        )}
        {name}
      </span>
    );
  };

  return (
    <div className="graph-page">
      <header className="topbar">
        <div className="title">
          <h1>Connection Graph</h1>
          <p className="sub">
            HackGT 13
            {status.kind === "ready" && raw?.synthetic && <span className="badge">Synthetic data</span>}
            {status.kind === "ready" && status.source === "mock" && <span className="badge">Preview</span>}
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Graph mode">
          {(["matches", "network"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setSelectedId(null); }}>
              {m === "matches" ? "Matches" : "My network"}
            </button>
          ))}
        </div>
      </header>

      <div className="controls" aria-label="Filters">
        <label className="slider">
          <span>Min score</span>
          <input type="range" min={0} max={0.8} step={0.05} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          <span className="num">{pct(minScore)}</span>
        </label>
        <div className="facets" role="group" aria-label="Facet">
          <button className={facet === null ? "on" : ""} onClick={() => setFacet(null)}>All</button>
          {FACETS.map((f) => (
            <button key={f} className={facet === f ? "on" : ""} onClick={() => setFacet(facet === f ? null : f)}>
              <span style={{ color: palette.facet[f] }} aria-hidden>{FACET_GLYPH[f]}</span> {f}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search people or topics" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="ghost" onClick={exportPng} disabled={status.kind !== "ready"}>Export PNG</button>
      </div>

      <div className="body">
        <div className="stage" ref={stageRef}>
          {status.kind === "loading" && (
            <div className="state">
              <div className="pulse" aria-hidden />
              <p>Mapping who you should meet…</p>
            </div>
          )}
          {status.kind === "error" && (
            <div className="state">
              <p className="state-title">Couldn&apos;t load your graph</p>
              <p className="muted">{status.message}</p>
              <button onClick={() => setReload((r) => r + 1)}>Try again</button>
            </div>
          )}
          {status.kind === "ready" && view && people.length === 0 && (
            <div className="state">
              <p className="state-title">{mode === "matches" ? "No matches yet" : "No connections yet"}</p>
              <p className="muted">
                {raw && raw.nodes.some((n) => n.type === "person")
                  ? "Nothing matches these filters. Lower the min score or clear the facet."
                  : mode === "matches"
                    ? "Check in to the event and add a source (GitHub or resume) to see people here."
                    : "Scan someone's QR after a conversation and they'll show up here."}
              </p>
            </div>
          )}
          {status.kind === "ready" && view && people.length > 0 && size.width > 0 && (
            <GraphCanvas
              data={view}
              palette={palette}
              width={size.width}
              height={size.height}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReady={onReady}
            />
          )}
          <div className="legend" aria-label="Legend">
            {FACETS.map((f) => (
              <span key={f}>
                <span style={{ color: palette.facet[f] }} aria-hidden>{FACET_GLYPH[f]}</span> {f}
              </span>
            ))}
            <span><span className="ring" aria-hidden /> top match</span>
            {mode === "matches" && <span><span className="dash" aria-hidden /> suggested</span>}
          </div>
        </div>

        <aside className="panel" aria-live="polite">
          {selected?.type === "person" ? (
            <div className="detail">
              <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
              <div className="who">
                <div className="avatar" aria-hidden>{selected.label.split(" ").map((w) => w[0]).join("").slice(0, 2)}</div>
                <div>
                  <h2>{selected.label}</h2>
                  <p className="muted">
                    {selected.role === "recruiter" ? "Recruiter" : "Student"}
                    {selected.rank ? ` · #${selected.rank}` : ""}
                    {selected.open_to_meet ? " · Open to meet" : ""}
                  </p>
                </div>
                <div className="score">
                  <span className="big">{pct(selected.score)}</span>
                  <span className="muted">match</span>
                </div>
              </div>
              {selected.highlight && <p className="flag">● Top match for you</p>}
              <h3>Why you matched</h3>
              <div className="chips">{selected.why.map((w) => <Chip key={w} name={w} />)}</div>
              <h3>Their topics</h3>
              <div className="chips">{selected.topics.map((w) => <Chip key={w} name={w} />)}</div>
              {selected.connected_at && (
                <p className="muted meta">
                  Met at {selected.met_at} · {selected.via === "invite" ? "private invite" : "in person"} ·{" "}
                  {new Date(selected.connected_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
            </div>
          ) : selected?.type === "topic" ? (
            <div className="detail">
              <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
              <h2><span style={{ color: palette.facet[selected.facet] }} aria-hidden>{FACET_GLYPH[selected.facet]}</span> {selected.label}</h2>
              <p className="muted">{selected.facet} · rarity {selected.idf.toFixed(1)}</p>
              <h3>People here who share it</h3>
              <ul className="list">
                {people.filter((p) => p.topics.includes(selected.label) || p.why.includes(selected.label)).map((p) => (
                  <li key={p.id}><button onClick={() => setSelectedId(p.id)}><span>{p.label}</span><span className="num">{pct(p.score)}</span></button></li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="detail">
              <h2>{mode === "matches" ? "Who to meet" : "Your connections"}</h2>
              <p className="muted">{people.length} {mode === "matches" ? "people, best match first" : "people"}. Tap one to see why.</p>
              <ol className="list">
                {people.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setSelectedId(p.id)}>
                      <span className={p.highlight ? "dot on" : "dot"} aria-hidden />
                      <span className="name">{p.label}</span>
                      <span className="muted topic">{p.top_topic}</span>
                      <span className="num">{pct(p.score)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
