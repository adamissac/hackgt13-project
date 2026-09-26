"use client";

import { useEffect, useState } from "react";
import { Bars, Sparkline } from "./charts";
import { fetchFeedInsights, type Source } from "@/lib/api";
import { useEmbeddedAuth } from "@/lib/auth";
import type { FeedInsights as Data } from "@/lib/types";

type Result = { key: string; data: Data; source: Source } | { key: string; error: string };

/** AR7 feed insights: trending topics and activity across your connections (aggregate, private to you). */
export default function FeedInsights() {
  const { token, api, ready } = useEmbeddedAuth();
  const [days, setDays] = useState(7);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${token ?? ""}|${days}|${api ?? ""}|${ready ? 1 : 0}|${reload}`;

  useEffect(() => {
    if (!ready) return;
    const ac = new AbortController();
    fetchFeedInsights(token, days, ac.signal)
      .then(({ data, source }) => setResult({ key, data, source }))
      .catch((e: unknown) => !ac.signal.aborted && setResult({ key, error: e instanceof Error ? e.message : "Couldn't load" }));
    return () => ac.abort();
  }, [key, token, days, ready]);

  const current = result?.key === key ? result : null;
  const d = current && "data" in current ? current.data : null;
  const total = d ? d.activity.reduce((a, x) => a + x.count, 0) : 0;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Feed insights</h1>
          <p className="sub">
            What your connections are up to
            {current && "source" in current && current.source === "mock" && <span className="badge">Preview</span>}
          </p>
        </div>
        <div className="seg small" role="group" aria-label="Time range">
          {[7, 30].map((n) => (
            <button key={n} className={days === n ? "on" : ""} aria-pressed={days === n} onClick={() => setDays(n)}>
              {n} days
            </button>
          ))}
        </div>
      </header>

      {!current && <div className="state"><div className="pulse" aria-hidden /><p>Reading your feed…</p></div>}
      {current && "error" in current && (
        <div className="state">
          <p className="state-title">Couldn&apos;t load insights</p>
          <p className="muted">{current.error}</p>
          <button onClick={() => setReload((r) => r + 1)}>Try again</button>
        </div>
      )}
      {d && (
        <>
          <section className="card">
            <div className="row-between">
              <div>
                <h2>Activity</h2>
                <p className="muted">{total} update{total === 1 ? "" : "s"} in the last {d.days} days</p>
              </div>
              <div className="kinds">
                <span><strong className="num">{d.by_kind.github}</strong> GitHub</span>
                <span><strong className="num">{d.by_kind.post}</strong> posts</span>
                <span><strong className="num">{d.by_kind.update}</strong> updates</span>
              </div>
            </div>
            <Sparkline data={d.activity} label={`Daily activity over ${d.days} days`} height={64} />
          </section>
          <section className="card">
            <h2>Trending in your network</h2>
            {d.trending_topics.length === 0 ? (
              <p className="muted">Nothing trending yet. Topics appear as your connections post and push code.</p>
            ) : (
              <Bars unit="mentions" rows={d.trending_topics.map((t) => ({ name: t.name, value: t.count }))} />
            )}
          </section>
        </>
      )}
    </main>
  );
}
