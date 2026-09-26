import type { GraphPayload } from "./types";

/**
 * Defense in depth on top of the server: the only person-to-person edges allowed are the viewer's
 * own (self <-> person). An edge between two other people (e.g. two of your connections) is
 * dropped, and links to nodes the API didn't return are dropped too.
 */
export function enforceGraphPrivacy(g: GraphPayload): GraphPayload {
  const ids = new Set(g.nodes.map((n) => n.id));
  const people = new Set(g.nodes.filter((n) => n.type === "person").map((n) => n.id));
  const links = g.links.filter((l) => {
    if (!ids.has(l.source) || !ids.has(l.target)) return false;
    if (people.has(l.source) && people.has(l.target)) return false;
    return true;
  });
  return { ...g, links };
}
