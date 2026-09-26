import { selfId, type GraphPayload } from "./types";

/**
 * Defense in depth on top of the server (MASTER_SPEC 3.12 hard rules): the only person-to-person
 * edges allowed are the viewer's own (me <-> person). An edge between two other people (e.g. two of
 * your connections) is dropped, as are edges to nodes the API didn't return.
 */
export function enforceGraphPrivacy(g: GraphPayload): GraphPayload {
  const me = selfId(g);
  // My Network shows only your connections: never a suggested match or anyone else
  if (g.mode === "network") {
    g = { ...g, nodes: g.nodes.filter((n) => n.type !== "person" || n.connected) };
  }
  const ids = new Set(g.nodes.map((n) => n.id));
  const people = new Set(g.nodes.filter((n) => n.type === "person").map((n) => n.id));
  const edges = g.edges.filter((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return false;
    if (people.has(e.source) && people.has(e.target)) return false;
    if ((e.kind === "match" || e.kind === "connection") && e.source !== me && e.target !== me) return false;
    return true;
  });
  return { ...g, edges };
}

/**
 * Merge a /graph/expand result into the current graph by id (existing nodes keep their object
 * identity downstream, so positions survive). Privacy is re-applied to the merged result.
 */
export function mergeGraph(base: GraphPayload, add: GraphPayload): GraphPayload {
  const byId = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of add.nodes) byId.set(n.id, { ...byId.get(n.id), ...n } as typeof n);
  const key = (e: { source: string; target: string; kind: string }) => `${e.source}|${e.target}|${e.kind}`;
  const edges = new Map(base.edges.map((e) => [key(e), e]));
  for (const e of add.edges) edges.set(key(e), e);
  return enforceGraphPrivacy({ ...base, nodes: [...byId.values()], edges: [...edges.values()] });
}
