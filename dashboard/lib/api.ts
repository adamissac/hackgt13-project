import { enforceGraphPrivacy } from "./privacy";
import { isGraphPayload, type GraphMode, type GraphPayload } from "./types";

const API = process.env.NEXT_PUBLIC_ML_API_URL?.replace(/\/$/, "") ?? "";

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
  return Boolean(API && token);
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
  const body = await getJson(live ? `${API}/graph?${params}` : `/mocks/graph_${q.mode}.json`, live ? token : null, signal);
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
  const body = await getJson(`${API}/graph/expand?${params}`, token);
  if (!isGraphPayload(body)) throw new Error("Unexpected /graph/expand response");
  return body;
}
