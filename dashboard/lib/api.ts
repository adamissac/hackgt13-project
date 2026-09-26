import { enforceGraphPrivacy } from "./privacy";
import {
  isEventMap,
  isFeedInsights,
  isGraphPayload,
  isMeDashboard,
  type EventMap,
  type GraphMode,
  type GraphPayload,
} from "./types";

const BUILD_API = process.env.NEXT_PUBLIC_ML_API_URL?.replace(/\/$/, "") ?? "";
let runtimeApi: string | null = null;

/** The app (WebView) tells us which ML server it uses; that wins over the build-time default. */
export function setApiBase(api: string | null) {
  runtimeApi = api;
}

function apiBase() {
  return runtimeApi ?? BUILD_API;
}

export type Source = "live" | "mock";

export interface GraphQuery {
  mode: GraphMode;
  eventId: number;
  depth: 1 | 2;
  maxPeople: number;
  minScore: number;
  facet: string; // "all" | Facet
}

async function getJson(url: string, token: string | null, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function isLive(token: string | null) {
  return Boolean(apiBase() && token);
}

/** Live GET /graph when there's an API URL and a token; otherwise the committed mocks (docs/mocks). */
export async function fetchGraph(
  q: GraphQuery,
  token: string | null,
  signal?: AbortSignal,
): Promise<{ data: GraphPayload; source: Source }> {
  const live = isLive(token);
  const params = new URLSearchParams({
    mode: q.mode,
    event_id: String(q.eventId),
    depth: String(q.depth),
    max_people: String(q.maxPeople),
    min_score: String(q.minScore),
    facet: q.facet,
  });
  const body = await getJson(live ? `${apiBase()}/graph?${params}` : `/mocks/graph_${q.mode}.json`, live ? token : null, signal);
  if (!isGraphPayload(body)) throw new Error("Unexpected /graph response");
  return { data: enforceGraphPrivacy({ ...body, mode: body.mode ?? q.mode }), source: live ? "live" : "mock" };
}

/** GET /graph/expand?node_id=&mode=&event_id= -> nodes and edges to merge in. */
export async function fetchExpand(
  nodeId: string,
  q: Pick<GraphQuery, "mode" | "eventId">,
  token: string | null,
): Promise<GraphPayload> {
  const live = isLive(token);
  if (!live) {
    // mock: only the demo topic has an expansion; anything else returns nothing new
    const body = await getJson("/mocks/graph_expand.json", null);
    if (!isGraphPayload(body)) throw new Error("Unexpected /graph/expand response");
    const mock = body as GraphPayload & { node_id?: string };
    const matches = mock.node_id === nodeId && (mock.mode ?? "matches") === q.mode;
    return matches ? body : { nodes: [], edges: [] };
  }
  const params = new URLSearchParams({ node_id: nodeId, mode: q.mode, event_id: String(q.eventId) });
  const body = await getJson(`${apiBase()}/graph/expand?${params}`, token);
  if (!isGraphPayload(body)) throw new Error("Unexpected /graph/expand response");
  return body;
}

/** GET /dashboard/{event_id} (organizer map). Mock when no API URL is configured. */
export async function fetchEventMap(eventId: number, signal?: AbortSignal): Promise<{ data: EventMap; source: Source }> {
  const live = Boolean(apiBase());
  const body = await getJson(live ? `${apiBase()}/dashboard/${eventId}` : "/mocks/dashboard_event.json", null, signal);
  if (!isEventMap(body)) throw new Error("Unexpected /dashboard response");
  return { data: anonymizeMap(body), source: live ? "live" : "mock" };
}

/** Client-side guard: keep only anonymous fields, fold clusters under 5 into "unclustered". */
export function anonymizeMap(m: EventMap): EventMap {
  const small = new Set(m.clusters.filter((c) => c.id !== -1 && c.size < 5).map((c) => c.id));
  return {
    ...m,
    nodes: m.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, cluster: small.has(n.cluster) ? -1 : n.cluster, role: n.role })),
    clusters: m.clusters.filter((c) => !small.has(c.id)),
    gaps: m.gaps.filter((g) => !small.has(g.clusters[0]) && !small.has(g.clusters[1])),
  };
}

async function authed<T>(path: string, mock: string, token: string | null, check: (v: unknown) => v is T,
  signal?: AbortSignal): Promise<{ data: T; source: Source }> {
  const live = isLive(token);
  const body = await getJson(live ? `${apiBase()}${path}` : mock, live ? token : null, signal);
  if (!check(body)) throw new Error(`Unexpected ${path.split("?")[0]} response`);
  return { data: body, source: live ? "live" : "mock" };
}

export const fetchMeDashboard = (token: string | null, days = 30, signal?: AbortSignal) =>
  authed(`/me/dashboard?days=${days}`, "/mocks/me_dashboard.json", token, isMeDashboard, signal);

export const fetchFeedInsights = (token: string | null, days = 7, signal?: AbortSignal) =>
  authed(`/feed/insights?days=${days}`, "/mocks/feed_insights.json", token, isFeedInsights, signal);
