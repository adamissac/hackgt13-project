"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Measure an element's width (charts draw in real pixels so text never scales). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });

/* ---------------------------------------------------------------- line (single series, crosshair) */
export function LineChart({ data, height = 190, label }: { data: { date: string; value: number }[]; height?: number; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = data.length ? `${path} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z` : "";
  const ticks = [0, Math.round(niceMax / 2), niceMax].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))));
  const h = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            const i = Math.round(((px - pad.l) / Math.max(1, iw)) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text key={d.date} className="tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
                {fmtDay(d.date)}
              </text>
            ) : null,
          )}
          <path className="area" d={area} />
          <path className="line" d={path} />
          {data.length > 0 && <circle className="end" cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r={4} />}
          {h && hover !== null && (
            <g>
              <line className="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />
              <circle className="hover-dot" cx={x(hover)} cy={y(h.value)} r={5} />
            </g>
          )}
        </svg>
      )}
      {h && hover !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover), 60), width - 60), top: 0 }}>
          <strong className="num">{h.value}</strong> <span>{fmtDay(h.date)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- donut (2-4 parts, legend + direct values) */
export function Donut({ parts, center, label }: {
  parts: { name: string; value: number; color: string }[];
  center: ReactNode;
  label: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const R = 70;
  const r = 50;
  const C = 2 * Math.PI * ((R + r) / 2);
  const gap = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label={label}>
        <circle cx={80} cy={80} r={(R + r) / 2} className="donut-track" strokeWidth={R - r} fill="none" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * C;
            const seg = (
              <circle
                key={p.name}
                cx={80}
                cy={80}
                r={(R + r) / 2}
                fill="none"
                stroke={p.color}
                strokeWidth={R - r}
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 80 80)"
              >
                <title>{`${p.name}: ${p.value}`}</title>
              </circle>
            );
            acc += len;
            return seg;
          })}
      </svg>
      <div className="donut-center">{center}</div>
      <ul className="legend-list">
        {parts.map((p) => (
          <li key={p.name}>
            <span className="sw" style={{ background: p.color }} aria-hidden />
            <span className="lname">{p.name}</span>
            <span className="num">{p.value}</span>
            <span className="muted num">{total ? `${Math.round((p.value / total) * 100)}%` : "–"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- horizontal bars (single measure) */
export function Bars({ rows, unit }: {
  rows: { name: string; value: number; mark?: ReactNode; note?: string }[];
  unit: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="bars">
      {rows.map((r) => (
        <li key={r.name} title={`${r.name}: ${r.value} ${unit}`}>
          <div className="bar-head">
            <span className="bar-name">{r.mark} {r.name}</span>
            <span className="num">{r.value}</span>
          </div>
          <div className="bar-track" aria-hidden>
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.note && <div className="bar-note muted">{r.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- sparkline */
export function Sparkline({ data, label, height = 56 }: { data: { date: string; count: number }[]; label: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...data.map((d) => d.count));
  const x = (i: number) => 4 + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (width - 8));
  const y = (v: number) => 6 + (height - 12) * (1 - v / max);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.count)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <div ref={ref} style={{ height }} className="spark">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <path className="line" d={path} />
          {last && <circle className="end" cx={x(data.length - 1)} cy={y(last.count)} r={3.5} />}
        </svg>
      )}
    </div>
  );
}
