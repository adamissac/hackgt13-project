"use client";

import { useEffect, useState } from "react";
import { Bars, Donut, LineChart } from "./charts";
import { fetchMeDashboard, type Source } from "@/lib/api";
import { useEmbeddedAuth } from "@/lib/auth";
import { FACET_GLYPH, usePalette } from "@/lib/theme";
import type { MeDashboard as Data } from "@/lib/types";

type Result = { key: string; data: Data; source: Source } | { key: string; error: string };

/** AR7 personal dashboard: private to the viewer (embedded in the app's Profile tab via WebView). */
export default function MeDashboard() {
  const { token, api, ready } = useEmbeddedAuth();
  const palette = usePalette();
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${token ?? ""}|${api ?? ""}|${ready ? 1 : 0}|${reload}`;

  useEffect(() => {
    if (!ready) return;
    const ac = new AbortController();
    fetchMeDashboard(token, 30, ac.signal)
      .then(({ data, source }) => setResult({ key, data, source }))
      .catch((e: unknown) => !ac.signal.aborted && setResult({ key, error: e instanceof Error ? e.message : "Couldn't load" }));
    return () => ac.abort();
  }, [key, token, ready]);

  const current = result?.key === key ? result : null;
  if (!current)
    return (
      <main className="page">
        <div className="state"><div className="pulse" aria-hidden /><p>Loading your network…</p></div>
      </main>
    );
  if ("error" in current)
    return (
      <main className="page">
        <div className="state">
          <p className="state-title">Couldn&apos;t load your dashboard</p>
          <p className="muted">{current.error}</p>
          <button onClick={() => setReload((r) => r + 1)}>Try again</button>
        </div>
      </main>
    );

  const d = current.data;
  const first = d.growth.find((g) => g.total > 0);
  const gained = d.growth.length ? d.growth[d.growth.length - 1].total - d.growth[0].total : 0;

  return (
    <main className="page">
      <header className="page-head">
        <h1>Your network</h1>
        <p className="sub">
          Only you can see this.
          {current.source === "mock" && <span className="badge">Preview</span>}
        </p>
      </header>

      {d.total === 0 ? (
        <section className="card empty">
          <p className="state-title">No connections yet</p>
          <p className="muted">Talk to someone at an event, verify with a QR scan, and both say yes. Or send a private invite to someone you already know.</p>
        </section>
      ) : (
        <>
          <section className="card hero">
            <div>
              <span className="hero-num">{d.total}</span>
              <span className="hero-label">connection{d.total === 1 ? "" : "s"}</span>
            </div>
            <p className="muted">
              +{gained} in the last {d.days} days{first ? ` · first on ${new Date(`${first.date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
            </p>
          </section>

          <section className="card">
            <h2>Network growth</h2>
            <LineChart data={d.growth.map((g) => ({ date: g.date, value: g.total }))} label="Connections over time" />
          </section>

          <div className="grid2">
            <section className="card">
              <h2>How you met</h2>
              <Donut
                label="In person versus private invite"
                parts={[
                  { name: "In person", value: d.how_met.in_person, color: palette.cluster[0] },
                  { name: "Private invite", value: d.how_met.invite, color: palette.cluster[1] },
                ]}
                center={<><span className="num big">{d.total}</span><span className="muted">total</span></>}
              />
            </section>

            <section className="card">
              <h2>What you connect over</h2>
              {d.top_topics.length === 0 ? (
                <p className="muted">Shared topics show up once your connections have profiles.</p>
              ) : (
                <Bars
                  unit="connections"
                  rows={[...d.top_topics].sort((a, b) => b.connections - a.connections || b.talked - a.talked).map((t) => ({
                    name: t.name,
                    value: t.connections,
                    mark: <span style={{ color: palette.facet[t.facet] }} aria-label={t.facet}>{FACET_GLYPH[t.facet]}</span>,
                    note: t.talked ? `talked about in ${t.talked} conversation${t.talked === 1 ? "" : "s"}` : undefined,
                  }))}
                />
              )}
              <p className="muted foot">Bar = connections who share the topic.</p>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
