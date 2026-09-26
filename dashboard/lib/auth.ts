"use client";

import { useEffect, useState } from "react";
import { setApiBase } from "./api";

export interface EmbeddedAuth {
  token: string | null;
  /** ML API base the app told us to use (it overrides NEXT_PUBLIC_ML_API_URL), or null. */
  api: string | null;
  /** false only while embedded in the app and still waiting for its first auth message */
  ready: boolean;
}

const EMBED_WAIT_MS = 2500;

function isEmbedded() {
  return typeof window !== "undefined" && "ReactNativeWebView" in window;
}

function validApi(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/.test(v)
    ? v.replace(/\/$/, "")
    : null;
}

/**
 * Embedded (WebView) auth: the app posts {type: "auth", token, api?} after load, when we say we're
 * {type: "ready"}, and on every token refresh. Listen on window AND document (Android WebViews dispatch on
 * document). Token and api live only in React state: never in the URL, never in storage.
 */
export function useEmbeddedAuth(): EmbeddedAuth {
  const [state, setState] = useState<{ token: string | null; api: string | null; got: boolean; timedOut: boolean }>({
    token: null,
    api: null,
    got: false,
    timedOut: false,
  });

  useEffect(() => {
    function onMessage(e: Event) {
      const raw = (e as MessageEvent).data;
      let data: unknown = raw;
      if (typeof raw === "string") {
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (typeof data !== "object" || data === null || (data as { type?: unknown }).type !== "auth") return;
      const t = (data as { token?: unknown }).token;
      const token = typeof t === "string" && t.length > 20 ? t : null;
      const api = validApi((data as { api?: unknown }).api);
      setApiBase(api);
      setState((s) => ({ ...s, token, api, got: true }));
    }
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);
    postToApp({ type: "ready" });
    const timer = window.setTimeout(() => setState((s) => ({ ...s, timedOut: true })), EMBED_WAIT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, []);

  return { token: state.token, api: state.api, ready: state.got || state.timedOut || !isEmbedded() };
}

/** Token only (kept for existing callers). */
export function useEmbeddedToken(): string | null {
  return useEmbeddedAuth().token;
}

/** Send a message back to the React Native app (no-op in a normal browser). */
export function postToApp(msg: Record<string, unknown>): boolean {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (!rn) return false;
  rn.postMessage(JSON.stringify(msg));
  return true;
}
