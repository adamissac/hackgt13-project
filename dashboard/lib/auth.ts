"use client";

import { useEffect, useState } from "react";

/**
 * Embedded (WebView) auth: the app posts {type: "auth", token} after load and on refresh.
 * Listen on window AND document (Android WebViews dispatch on document). The token lives only in
 * React state: never in the URL, never in storage.
 */
export function useEmbeddedToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

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
      if (
        typeof data === "object" &&
        data !== null &&
        (data as { type?: unknown }).type === "auth" &&
        typeof (data as { token?: unknown }).token === "string" &&
        (data as { token: string }).token.length > 20
      ) {
        setToken((data as { token: string }).token);
      }
    }
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
    };
  }, []);

  return token;
}

/** Send a message back to the React Native app (no-op in a normal browser). */
export function postToApp(msg: Record<string, unknown>): boolean {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (!rn) return false;
  rn.postMessage(JSON.stringify(msg));
  return true;
}
