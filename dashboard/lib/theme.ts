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
}

export const LIGHT: Palette = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  hairline: "#e1e0d9",
  person: "#52514e",
  personRecruiter: "#0b0b0b",
  self: "#0b0b0b",
  selfInk: "#ffffff",
  highlight: "#0ca30c",
  link: "rgba(11,11,11,0.14)",
  linkStrong: "rgba(11,11,11,0.45)",
  facet: { technical: "#2a78d6", career: "#eda100", personal: "#e87ba4", academic: "#008300" },
};

export const DARK: Palette = {
  surface: "#1a1a19",
  ink: "#ffffff",
  inkSecondary: "#c3c2b7",
  muted: "#898781",
  hairline: "#2c2c2a",
  person: "#c3c2b7",
  personRecruiter: "#ffffff",
  self: "#ffffff",
  selfInk: "#0b0b0b",
  highlight: "#0ca30c",
  link: "rgba(255,255,255,0.14)",
  linkStrong: "rgba(255,255,255,0.5)",
  facet: { technical: "#3987e5", career: "#c98500", personal: "#d55181", academic: "#008300" },
};

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
