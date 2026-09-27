"use client";

import { useSyncExternalStore } from "react";
import type { Facet } from "./types";

/**
 * Canvas colors. Facet hues are the 4-slot set that passes the dataviz validator all-pairs in
 * BOTH modes (blue, yellow, magenta, green). Dark CVD sits in the 6-8 band, so facets always carry
 * a secondary encoding: marker shape (FACET_SHAPE) plus text labels.
 * Green-ring "top match" uses the status-good step on PEOPLE nodes only; facet color is on topics.
 */
export interface Palette {
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  hairline: string;
  person: string;
  personRecruiter: string;
  self: string;
  selfInk: string;
  highlight: string;
  link: string;
  linkStrong: string;
  facet: Record<Facet, string>;
  cluster: [string, string, string];
  clusterOther: string;
}

export const LIGHT: Palette = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  hairline: "#e1e0d9",
  person: "#52514e",
  personRecruiter: "#898781",
  self: "#0b0b0b",
  selfInk: "#ffffff",
  highlight: "#0ca30c",
  link: "rgba(11,11,11,0.14)",
  linkStrong: "rgba(11,11,11,0.45)",
  facet: { technical: "#2a78d6", career: "#eda100", personal: "#e87ba4", academic: "#008300" },
  cluster: ["#2a78d6", "#eb6834", "#1baf7a"],
  clusterOther: "#c3c2b7",
};

export const DARK: Palette = {
  surface: "#1a1a19",
  ink: "#ffffff",
  inkSecondary: "#c3c2b7",
  muted: "#898781",
  hairline: "#2c2c2a",
  person: "#c3c2b7",
  personRecruiter: "#898781",
  self: "#ffffff",
  selfInk: "#0b0b0b",
  highlight: "#0ca30c",
  link: "rgba(255,255,255,0.14)",
  linkStrong: "rgba(255,255,255,0.5)",
  facet: { technical: "#3987e5", career: "#c98500", personal: "#d55181", academic: "#008300" },
  cluster: ["#3987e5", "#d95926", "#199e70"],
  clusterOther: "#52514e",
};

/**
 * Cluster mode: only the 3 largest clusters get a hue (the reference palette's first 3 slots are the
 * only set that validates all-pairs in both modes); the rest fold into "other" gray.
 */
export function clusterColor(p: Palette, slot: number | undefined): string {
  return slot === undefined ? p.clusterOther : p.cluster[slot] ?? p.clusterOther;
}

export const FACET_SHAPE: Record<Facet, "circle" | "square" | "diamond" | "triangle"> = {
  technical: "circle",
  career: "square",
  personal: "diamond",
  academic: "triangle",
};

export const FACET_GLYPH: Record<Facet, string> = {
  technical: "●",
  career: "■",
  personal: "◆",
  academic: "▲",
};

/* ------------------------------------------------------------------ theme choice
 * Three states, not two: the CSS was written with `:root:not([data-theme="light"])` inside the
 * prefers-color-scheme block, which only makes sense if an explicit light choice can override a
 * dark system. A two-way toggle would strand people off "follow system" permanently.
 *
 * "system" is stored as the absence of data-theme, so CSS needs no fourth case.
 */
export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "fc.theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";            // Safari private mode throws on localStorage
  }
}

const themeListeners = new Set<() => void>();

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* choice still applies for this page; it just will not persist */
  }
  themeListeners.forEach((l) => l());
}

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  window.addEventListener("storage", cb);   // another tab changed it
  return () => {
    themeListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * The chosen theme, and a setter. useSyncExternalStore rather than useState+useEffect: the source
 * of truth is localStorage, which is external to React, and reading it in an effect trips
 * react-hooks/set-state-in-effect. The server snapshot is "system" because localStorage does not
 * exist there; the inline head script has already applied the real colors, so only this button's
 * icon settles at hydration.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  return [theme, applyTheme];
}

/**
 * Runs synchronously in <head>, before first paint, so a dark-mode user never sees a white flash.
 * Inlined as a string because a bundled module would load too late. Kept tiny and total-failure
 * safe: if anything throws we simply fall through to the prefers-color-scheme default.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});`
  + `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function currentDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", cb);
    mo.disconnect();
  };
}

export function usePalette(): Palette {
  const dark = useSyncExternalStore(subscribe, currentDark, () => true);
  return dark ? DARK : LIGHT;
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: (typeof FACET_SHAPE)[Facet],
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, r, 0, 2 * Math.PI);
  else if (shape === "square") ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
  else if (shape === "diamond") {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x, y + r * 1.2);
    ctx.lineTo(x - r * 1.2, y);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.1, y + r * 0.8);
    ctx.lineTo(x - r * 1.1, y + r * 0.8);
    ctx.closePath();
  }
}
