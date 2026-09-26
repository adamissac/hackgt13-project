"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchEventMap, type Source } from "@/lib/api";
import { bubbleLayout, shortLabel } from "@/lib/bubbleLayout";
import type { EventMap, MapCluster, MapGap } from "@/lib/types";

const W = 1000;
const H = 680;
const PAD = 70;
const POLL_MS = 7000;
const REPLAY_MS = 45000; // mock: replay the whole event in 45s
const NEW_WINDOW_MIN = 45;

const fmtTime = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function CommunityMap({ eventId = 1 }: { eventId?: number }) {
  const [data, setData] = useState<EventMap | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gapIdx, setGapIdx] = useState(0);
  const [clock, setClock] = useState<number | null>(null); // null = live / end of window
  const [playing, setPlaying] = useState(true);
  const [reload, setReload] = useState(0);

  // load; poll when live (organizers can't read `connections`, so this goes through FastAPI)
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const load = () =>
      fetchEventMap(eventId, ac.signal)
        .then(({ data, source }) => {
          if (!alive) return;
          setData(data);
          setSource(source);
          setError(null);
        })
        .catch((e: unknown) => alive && !ac.signal.aborted && setError(e instanceof Error ? e.message : "Couldn't load"));
    load();
    const id = setInterval(() => source === "live" && load(), POLL_MS);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(id);
    };
  }, [eventId, reload, source]);

  const span = useMemo(() => {
    if (!data) return null;
    const ts = data.edges.flatMap((e) => (e.created_at ? [Date.parse(e.created_at)] : []));
    const start = data.window ? Date.parse(data.window.start) : Math.min(...ts);
    const end = data.window ? Date.parse(data.window.end) : Math.max(...ts);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
  }, [data]);

  // mock replay: advance the clock through the event
  useEffect(() => {
    if (!span || source !== "mock" || !playing) return;
    const step = ((span.end - span.start) / REPLAY_MS) * 100;
    const id = setInterval(() => {
      setClock((c) => {
        const next = (c ?? span.start) + step;
        return next > span.end ? span.start : next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [span, source, playing]);

  const now = clock ?? span?.end ?? Number.POSITIVE_INFINITY;

  const geo = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    const { pos, bubbles, dot, width, height } = bubbleLayout(data.nodes, data.clusters, W, H, { pad: PAD / 2 });
    return { pos, dot, width, height, clusters: bubbles.map((b) => ({ ...b, top: b.cy - b.r })) };
  }, [data]);

  const visibleEdges = useMemo(
    () => (data?.edges ?? []).filter((e) => !e.created_at || Date.parse(e.created_at) <= now),
    [data, now],
  );
  const gap: MapGap | undefined = data?.gaps[gapIdx];
  const labelOf = (id: number) => data?.clusters.find((c) => c.id === id)?.label ?? `cluster ${id}`;
  const clusterRole = (c: MapCluster) => (gap && c.id === gap.clusters[0] ? "a" : gap && c.id === gap.clusters[1] ? "b" : "");

  if (error && !data) {
    return (
      <div className="map-page">
        <div className="state">
          <p className="state-title">Couldn&apos;t load the community map</p>
          <p className="muted">{error}</p>
          <button onClick={() => setReload((r) => r + 1)}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data || !geo) {
    return (
      <div className="map-page">
        <div className="state">
          <div className="pulse" aria-hidden />
          <p>{data ? "Waiting for attendees to check in…" : "Mapping the event's communities…"}</p>
        </div>
      </div>
    );
  }

  const ga = gap && geo.clusters.find((c) => c.id === gap.clusters[0]);
  const gb = gap && geo.clusters.find((c) => c.id === gap.clusters[1]);

  return (
    <div className="map-page">
      <header className="map-head">
        <div>
          <h1>{data.event_name ?? "Event"} community map</h1>
          <p className="sub">
            Anonymous: no names, groups of 5+
            {data.synthetic && <span className="badge">Synthetic data</span>}
            {source === "mock" && <span className="badge">Preview</span>}
            {source === "live" && <span className="badge live">● Live</span>}
          </p>
        </div>
        <div className="tiles">
          <div className="tile"><span className="v">{data.stats?.attendees ?? data.nodes.length}</span><span className="k">attendees</span></div>
          <div className="tile"><span className="v">{visibleEdges.length}</span><span className="k">connections</span></div>
          <div className="tile"><span className="v">{geo.clusters.length}</span><span className="k">communities</span></div>
        </div>
      </header>

      <div className="map-body">
        <div className="map-stage">
          <svg viewBox={`0 0 ${geo.width} ${geo.height}`} role="img" aria-label="Community map of interest clusters and connections">
            {geo.clusters.map((c) => {
              const r = clusterRole(c);
              return (
                <circle key={`h${c.id}`} className={`hull ${r ? `hull-${r}` : ""}`} cx={c.cx} cy={c.cy} r={c.r} />
              );
            })}
            {visibleEdges.map((e, i) => {
              const a = geo.pos.get(e.source);
              const b = geo.pos.get(e.target);
              if (!a || !b) return null;
              const fresh = e.created_at && now - Date.parse(e.created_at) < NEW_WINDOW_MIN * 60000;
              return <line key={i} className={fresh ? "edge fresh" : "edge"} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
            })}
            {data.nodes.map((n) => {
              const p = geo.pos.get(n.id)!;
              const c = geo.clusters.find((x) => x.id === n.cluster);
              const r = c ? clusterRole(c) : "";
              return (
                <circle key={n.id} className={`dot ${n.cluster === -1 ? "dot-none" : ""} ${r ? `dot-${r}` : ""}`} cx={p[0]} cy={p[1]} r={geo.dot}>
                  <title>{c ? shortLabel(c.label) : "Unclustered"}</title>
                </circle>
              );
            })}
            {ga && gb && gap && (() => {
              // bow the bridge sideways (perpendicular to A->B), toward the frame's center
              const [dx, dy] = [gb.cx - ga.cx, gb.cy - ga.cy];
              const len = Math.hypot(dx, dy) || 1;
              let [nx, ny] = [-dy / len, dx / len];
              const [mx0, my0] = [(ga.cx + gb.cx) / 2, (ga.cy + gb.cy) / 2];
              if ((geo.width / 2 - mx0) * nx + (geo.height / 2 - my0) * ny < 0) [nx, ny] = [-nx, -ny];
              const bow = Math.max(ga.r + gb.r + 40, len * 0.35);
              const [qx, qy] = [mx0 + nx * bow, my0 + ny * bow];
              const [mx, my] = [(mx0 + qx) / 2, (my0 + qy) / 2]; // curve midpoint
              const text = `${gap.actual} of ~${Math.round(gap.expected)} expected`;
              return (
                <g className="bridge">
                  <path d={`M${ga.cx},${ga.cy} Q${qx},${qy} ${gb.cx},${gb.cy}`} />
                  {(() => {
                    // pill sits beside the curve on its outer side, never on top of a bubble label
                    const w = text.length * 10.6 + 24;
                    const half = (c: typeof ga) => (shortLabel(c.label).length * 12.2) / 2;
                    const clearR = Math.max(ga.cx + half(ga), gb.cx + half(gb), mx) + 14;
                    const clearL = Math.min(ga.cx - half(ga), gb.cx - half(gb), mx) - 14;
                    const left = nx >= 0 ? clearR : clearL - w;
                    return (
                      <>
                        <line className="leader" x1={mx} y1={my} x2={nx >= 0 ? left : left + w} y2={my} />
                        <rect x={left} y={my - 18} width={w} height={36} rx={18} />
                        <text x={left + w / 2} y={my + 6} textAnchor="middle">{text}</text>
                      </>
                    );
                  })()}
                </g>
              );
            })()}
            {geo.clusters.map((c) => (
              <g key={`l${c.id}`} className={`clabel ${clusterRole(c) ? `clabel-${clusterRole(c)}` : ""}`}>
                <text x={c.cx} y={c.top - 12} textAnchor="middle">{shortLabel(c.label)}</text>
                <text x={c.cx} y={c.top - 12} dy={-26} textAnchor="middle" className="csize">{c.size} people</text>
              </g>
            ))}
          </svg>
          {span && (
            <div className="replay">
              {source === "mock" && (
                <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause replay" : "Play replay"}>
                  {playing ? "❚❚" : "▶"}
                </button>
              )}
              <input
                type="range"
                min={span.start}
                max={span.end}
                step={60000}
                value={Math.min(Math.max(now, span.start), span.end)}
                onChange={(e) => {
                  setPlaying(false);
                  setClock(Number(e.target.value));
                }}
                aria-label="Event timeline"
              />
              <span className="num">{fmtTime(now)}</span>
              {source === "live" && clock !== null && <button onClick={() => setClock(null)}>Live</button>}
            </div>
          )}
        </div>

        <aside className="gaps">
          <h2>Should be talking, aren&apos;t</h2>
          <p className="muted">Communities whose members are strong matches but have barely connected. Expected = sum of match probabilities over each person&apos;s top 10.</p>
          {data.gaps.length === 0 ? (
            <p className="muted">No big gaps yet. Communities are mixing well.</p>
          ) : (
            <ol className="gap-list">
              {data.gaps.map((g, i) => {
                const pctMade = g.expected ? Math.min(1, g.actual / g.expected) : 0;
                return (
                  <li key={g.clusters.join("-")}>
                    <button className={i === gapIdx ? "on" : ""} onClick={() => setGapIdx(i)} aria-pressed={i === gapIdx}>
                      <span className="pair">
                        <span className="sw sw-a" aria-hidden /> {shortLabel(g.labels?.[0] ?? labelOf(g.clusters[0])).split(" + ")[0]}
                        <span className="x">↔</span>
                        <span className="sw sw-b" aria-hidden /> {shortLabel(g.labels?.[1] ?? labelOf(g.clusters[1])).split(" + ")[0]}
                      </span>
                      <span className="bar" aria-hidden><span style={{ width: `${pctMade * 100}%` }} /></span>
                      <span className="nums num">{g.actual} made · ~{Math.round(g.expected)} expected</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
