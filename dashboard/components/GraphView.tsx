"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import type { ColorBy } from "./ConnectionGraph";
import { fetchExpand, fetchGraph, type Source } from "@/lib/api";
import { postToApp, useEmbeddedAuth } from "@/lib/auth";
import { mergeGraph } from "@/lib/privacy";
import { FACET_GLYPH, clusterColor, usePalette } from "@/lib/theme";
import { FACETS, type Facet, type GraphMode, type GraphPayload, type PersonNode, type TopicNode } from "@/lib/types";

type Result =
  | { key: string; data: GraphPayload; source: Source; pinned: Set<string> }
  | { key: string; error: string };

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

const pct = (v: number) => `${Math.round(v * 100)}%`;
const when = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

interface ViewFilter {
  minScore: number;
  maxPeople: number;
  facet: Facet | null;
  query: string;
  until: number | null; // timeline cutoff (ms) in My Network
  pinned: Set<string>; // people added by an expand: always shown, even past Max people
}

/** Client-side view of one fetch: filters, max people, timeline. Never adds people the API didn't return. */
function filterGraph(g: GraphPayload, f: ViewFilter): GraphPayload {
  const q = f.query.trim().toLowerCase();
  const topics = new Map(g.nodes.filter((n): n is TopicNode => n.type === "topic").map((t) => [t.id, t]));
  const personTopics = new Map<string, TopicNode[]>();
  for (const e of g.edges) {
    const t = topics.get(e.target);
    if (t && e.kind === "has_topic") personTopics.set(e.source, [...(personTopics.get(e.source) ?? []), t]);
  }
  const people = g.nodes
    .filter((n): n is PersonNode => n.type === "person")
    .filter((n) => n.score >= f.minScore)
    .filter((n) => !f.facet || (personTopics.get(n.id) ?? []).some((t) => t.facet === f.facet))
    .filter((n) => !f.until || !n.connected_at || Date.parse(n.connected_at) <= f.until)
    .filter(
      (n) =>
        !q ||
        n.label.toLowerCase().includes(q) ||
        (n.name ?? "").toLowerCase().includes(q) ||
        (personTopics.get(n.id) ?? []).some((t) => t.label.includes(q)),
    )
    .sort((a, b) => b.score - a.score);
  // top `maxPeople` by score, plus anyone pulled in by an expand (on top of the cap)
  const capped = people.filter((n) => !f.pinned.has(n.id)).slice(0, f.maxPeople);
  const shown = [...capped, ...people.filter((n) => f.pinned.has(n.id))].sort((a, b) => b.score - a.score);
  const keep = new Set<string>(shown.map((p) => p.id));
  for (const n of g.nodes) {
    if (n.type === "self") keep.add(n.id);
    if (n.type === "topic" && (!f.facet || n.facet === f.facet)) keep.add(n.id);
  }
  const edges = g.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { ...g, nodes: g.nodes.filter((n) => keep.has(n.id)), edges };
}

export default function GraphView({ eventId = 1, initialMode = "matches" }: { eventId?: number; initialMode?: GraphMode }) {
  const { token, api, ready } = useEmbeddedAuth();
  const palette = usePalette();
  const [mode, setMode] = useState<GraphMode>(initialMode);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [maxPeople, setMaxPeople] = useState(30);
  const [minScore, setMinScore] = useState(0);
  const [facet, setFacet] = useState<Facet | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("facet");
  const [query, setQuery] = useState("");
  const [timeline, setTimeline] = useState(100); // percent through the connection history
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [expanded, setExpanded] = useState<{ key: string; data: GraphPayload; pinned: Set<string> } | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [serverQuery, setServerQuery] = useState({ maxPeople: 30, minScore: 0, facet: null as Facet | null });
  const [stageRef, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // One server fetch per mode / depth / Rebuild. Sliders filter that result client-side.
  const key = `${mode}|${eventId}|${depth}|${token ?? ""}|${api ?? ""}|${ready ? 1 : 0}|${reload}`;
  useEffect(() => {
    if (!ready) return;
    const ac = new AbortController();
    fetchGraph(
      {
        mode,
        eventId,
        depth,
        maxPeople: Math.max(serverQuery.maxPeople, 30),
        minScore: serverQuery.minScore,
        facet: serverQuery.facet ?? "all",
      },
      token,
      ac.signal,
    )
      .then(async ({ data, source }) => {
        // depth 2 on mocks: also expand through shared topics (the live server does this itself)
        const pinned = new Set<string>();
        if (depth === 2 && source === "mock" && mode === "matches") {
          for (const t of data.nodes.filter((n) => n.type === "topic")) {
            const add = await fetchExpand(t.id, { mode, eventId }, token);
            add.nodes.forEach((n) => n.type === "person" && pinned.add(n.id));
            data = mergeGraph(data, add);
          }
        }
        setResult({ key, data, source, pinned });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setResult({ key, error: e instanceof Error ? e.message : "Couldn't load the graph" });
      });
    return () => ac.abort();
    // serverQuery only changes together with `reload` (Rebuild), which is part of `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode, eventId, depth, token]);

  const current = result?.key === key ? result : null;
  const base = current && "data" in current ? current.data : null;
  const raw = base && expanded?.key === key ? expanded.data : base;
  const pinned = useMemo(
    () =>
      expanded?.key === key
        ? expanded.pinned
        : current && "pinned" in current
          ? current.pinned
          : new Set<string>(),
    [expanded, key, current],
  );
  const source = current && "data" in current ? current.source : null;
  const error = current && "error" in current ? current.error : null;

  // timeline bounds (My Network)
  const times = useMemo(
    () =>
      (raw?.nodes ?? [])
        .flatMap((n) => (n.type === "person" && n.connected_at ? [Date.parse(n.connected_at)] : []))
        .sort((a, b) => a - b),
    [raw],
  );
  const hasTimeline = mode === "network" && times.length > 1;
  const until = hasTimeline ? times[0] + ((times[times.length - 1] - times[0]) * timeline) / 100 : null;

  const view = useMemo(
    () => (raw ? filterGraph(raw, { minScore, maxPeople, facet, query, until, pinned }) : null),
    [raw, minScore, maxPeople, facet, query, until, pinned],
  );
  const people = useMemo(() => view?.nodes.filter((n): n is PersonNode => n.type === "person") ?? [], [view]);
  const selected = view?.nodes.find((n) => n.id === selectedId) ?? null;
  const topicByLabel = useMemo(() => {
    const m = new Map<string, TopicNode>();
    raw?.nodes.forEach((n) => n.type === "topic" && m.set(n.label, n));
    return m;
  }, [raw]);

  // cluster -> color slot: the 3 largest clusters in view get hues, the rest are "other"
  const clusterSlots = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of people) if (p.cluster !== null) counts.set(p.cluster, (counts.get(p.cluster) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return new Map(top.map(([c], i) => [c, i]));
  }, [people]);

  const onReady = useCallback((c: HTMLCanvasElement | null) => {
    canvasRef.current = c;
  }, []);

  async function expand(nodeId: string) {
    if (!raw) return;
    setExpanding(nodeId);
    setNotice(null);
    try {
      const add = await fetchExpand(nodeId, { mode, eventId }, token);
      const before = new Set(raw.nodes.map((n) => n.id));
      const added = add.nodes.filter((n) => n.type === "person" && !before.has(n.id)).length;
      const nextPinned = new Set(pinned);
      add.nodes.forEach((n) => n.type === "person" && nextPinned.add(n.id));
      setExpanded({ key, data: mergeGraph(raw, add), pinned: nextPinned });
      setNotice(added ? `Added ${added} ${added === 1 ? "person" : "people"}` : "No one new to show here");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't expand");
    } finally {
      setExpanding(null);
    }
  }

  function rebuild() {
    setServerQuery({ maxPeople, minScore, facet });
    setExpanded(null);
    setSelectedId(null);
    setNotice(null);
    setReload((r) => r + 1);
  }

  function switchMode(m: GraphMode) {
    setMode(m);
    setSelectedId(null);
    setNotice(null);
    setTimeline(100);
  }

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
    const t = topicByLabel.get(name);
    return (
      <span className="chip">
        {t && (
          <span className="chip-mark" style={{ color: palette.facet[t.facet] }} aria-label={t.facet}>
            {FACET_GLYPH[t.facet]}
          </span>
        )}
        {name}
      </span>
    );
  };

  const personTopics = (p: PersonNode) => p.topics ?? p.why ?? [p.top_topic];
  const displayName = (p: PersonNode) => p.name ?? p.label;

  return (
    <div className="graph-page">
      <header className="topbar">
        <div className="title">
          <h1>Connection Graph</h1>
          <p className="sub">
            HackGT 13
            {raw?.synthetic && <span className="badge">Synthetic data</span>}
            {source === "mock" && <span className="badge">Preview</span>}
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Graph mode">
          {(["matches", "network"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => switchMode(m)}>
              {m === "matches" ? "Matches" : "My network"}
            </button>
          ))}
        </div>
      </header>

      <div className="controls" aria-label="Graph controls">
        <div className="seg small" role="group" aria-label="Depth">
          <span className="lbl">Depth</span>
          {([1, 2] as const).map((d) => (
            <button key={d} className={depth === d ? "on" : ""} onClick={() => setDepth(d)} aria-pressed={depth === d}>
              {d}
            </button>
          ))}
        </div>
        <label className="slider">
          <span>Max</span>
          <input type="range" min={5} max={60} step={5} value={maxPeople} onChange={(e) => setMaxPeople(Number(e.target.value))} />
          <span className="num">{maxPeople}</span>
        </label>
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
        <div className="seg small" role="group" aria-label="Color by">
          <span className="lbl">Color</span>
          {(["facet", "cluster"] as const).map((c) => (
            <button key={c} className={colorBy === c ? "on" : ""} onClick={() => setColorBy(c)} aria-pressed={colorBy === c}>
              {c === "facet" ? "Facet" : "Cluster"}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={rebuild}>Rebuild</button>
        <button className="ghost" onClick={exportPng} disabled={!view}>Export PNG</button>
      </div>

      <div className="body">
        <aside className="panel" aria-live="polite">
          {selected?.type === "person" ? (
            <div className="detail">
              <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
              <div className="who">
                <div className="avatar" aria-hidden>
                  {displayName(selected).split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <h2>{displayName(selected)}</h2>
                  <p className="muted">
                    {selected.role === "recruiter" ? "Recruiter" : "Student"}
                    {selected.rank && !selected.connected ? ` · #${selected.rank}` : ""}
                    {selected.open_to_meet ? " · Open to meet" : ""}
                  </p>
                </div>
                <div className="score">
                  <span className="big">{pct(selected.score)}</span>
                  <span className="muted">match</span>
                </div>
              </div>
              {selected.highlight && <p className="flag">● Top match for you</p>}
              {selected.why && selected.why.length > 0 && (
                <>
                  <h3>Why you matched</h3>
                  <div className="chips">{selected.why.map((w) => <Chip key={w} name={w} />)}</div>
                </>
              )}
              <h3>Their topics</h3>
              <div className="chips">{personTopics(selected).map((w) => <Chip key={w} name={w} />)}</div>
              {selected.connected_at && (
                <p className="muted meta">
                  Met at {selected.met_at ?? "an event"} · {selected.how_met === "invite" ? "private invite" : "in person"} ·{" "}
                  {when(selected.connected_at)}
                </p>
              )}
              <button className="expand" onClick={() => expand(selected.id)} disabled={expanding !== null}>
                {expanding === selected.id ? "Loading…" : "Show shared topics and evidence"}
              </button>
            </div>
          ) : selected?.type === "topic" ? (
            <div className="detail">
              <button className="close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
              <h2>
                <span style={{ color: palette.facet[selected.facet] }} aria-hidden>{FACET_GLYPH[selected.facet]}</span>{" "}
                {selected.label}
              </h2>
              <p className="muted">
                {selected.facet}
                {selected.idf ? ` · rarity ${selected.idf.toFixed(1)}` : ""}
              </p>
              <button className="expand" onClick={() => expand(selected.id)} disabled={expanding !== null}>
                {expanding === selected.id ? "Finding people…" : "Find more people who share this"}
              </button>
              <h3>People in view who share it</h3>
              <ul className="list">
                {people
                  .filter((p) => personTopics(p).includes(selected.label) || p.top_topic === selected.label)
                  .map((p) => (
                    <li key={p.id}>
                      <button onClick={() => setSelectedId(p.id)}>
                        <span className="name">{displayName(p)}</span>
                        <span className="num">{pct(p.score)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="detail">
              <h2>{mode === "matches" ? "Who to meet" : "Your connections"}</h2>
              <input
                className="search wide"
                type="search"
                placeholder="Search people or topics"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search people or topics"
              />
              <p className="muted">
                {people.length} {mode === "matches" ? "people, best match first" : "people"}. Tap one to see why.
              </p>
              <ol className="list">
                {people.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setSelectedId(p.id)}>
                      <span
                        className={p.highlight ? "dot on" : "dot"}
                        style={
                          colorBy === "cluster"
                            ? {
                                background: clusterColor(palette, p.cluster === null ? undefined : clusterSlots.get(p.cluster)),
                                borderColor: "transparent",
                              }
                            : undefined
                        }
                        aria-hidden
                      />
                      <span className="name">{displayName(p)}</span>
                      <span className="muted topic">{p.top_topic}</span>
                      <span className="num">{p.connected_at ? when(p.connected_at) : pct(p.score)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>

        <div className="stage-wrap">
          <div className="stage" ref={stageRef}>
            {!current && (
              <div className="state">
                <div className="pulse" aria-hidden />
                <p>Mapping who you should meet…</p>
              </div>
            )}
            {error && (
              <div className="state">
                <p className="state-title">Couldn&apos;t load your graph</p>
                <p className="muted">{error}</p>
                <button onClick={() => setReload((r) => r + 1)}>Try again</button>
              </div>
            )}
            {view && people.length === 0 && (
              <div className="state">
                <p className="state-title">{mode === "matches" ? "No matches yet" : "No connections yet"}</p>
                <p className="muted">
                  {raw && raw.nodes.some((n) => n.type === "person")
                    ? "Nothing matches these filters. Lower the min score or clear the facet."
                    : mode === "matches"
                      ? "Check in to the event and add a source (GitHub or resume) to see people here."
                      : "Talk to someone, verify with a QR scan, and both say yes. They'll show up here."}
                </p>
              </div>
            )}
            {view && people.length > 0 && size.width > 0 && (
              <GraphCanvas
                data={view}
                palette={palette}
                colorBy={colorBy}
                clusterSlots={clusterSlots}
                width={size.width}
                height={size.height}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onReady={onReady}
              />
            )}
            {notice && (
              <div className="toast" role="status">
                {notice}
              </div>
            )}
            <div className="legend" aria-label="Legend">
              {colorBy === "facet" ? (
                FACETS.map((f) => (
                  <span key={f}>
                    <span style={{ color: palette.facet[f] }} aria-hidden>{FACET_GLYPH[f]}</span> {f}
                  </span>
                ))
              ) : (
                <>
                  {[...clusterSlots.entries()].map(([c, slot]) => (
                    <span key={c}>
                      <span className="sw" style={{ background: clusterColor(palette, slot) }} aria-hidden /> cluster {c}
                    </span>
                  ))}
                  <span>
                    <span className="sw" style={{ background: palette.clusterOther }} aria-hidden /> other
                  </span>
                </>
              )}
              <span>
                <span className="ring" aria-hidden /> top match
              </span>
              {mode === "matches" ? (
                <span>
                  <span className="dash" aria-hidden /> suggested
                </span>
              ) : (
                <span>
                  <span className="solid" aria-hidden /> connected
                </span>
              )}
            </div>
          </div>
          {hasTimeline && until !== null && (
            <label className="timeline">
              <span className="muted">{when(new Date(times[0]).toISOString())}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={timeline}
                onChange={(e) => setTimeline(Number(e.target.value))}
                aria-label="Timeline"
              />
              <span className="num">{timeline === 100 ? "Now" : when(new Date(until).toISOString())}</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
