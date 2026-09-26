// GET /graph and GET /graph/expand (MASTER_SPEC Section 9; additive display fields in docs/api.md).

export type Facet = "technical" | "career" | "personal" | "academic";
export type GraphMode = "matches" | "network";
export type Role = "student" | "recruiter";

export interface SelfNode {
  id: string;
  type: "self";
  label: string;
}

export interface PersonNode {
  id: string;
  type: "person";
  label: string; // first name
  score: number;
  highlight: boolean;
  open_to_meet: boolean;
  cluster: number | null;
  connected: boolean;
  connected_at: string | null;
  top_topic: string;
  // additive display fields
  name?: string;
  role?: Role;
  why?: string[];
  topics?: string[];
  shared_count?: number;
  rank?: number;
  photo_url?: string | null;
  met_at?: string;
  how_met?: "in_person" | "invite";
}

export interface TopicNode {
  id: string;
  type: "topic";
  label: string;
  facet: Facet;
  idf?: number;
}

export type GraphNode = SelfNode | PersonNode | TopicNode;

export type EdgeKind = "match" | "connection" | "has_topic";

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  weight: number;
  facet?: Facet;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode?: GraphMode;
  event_id?: number;
  self_id?: string;
  generated_at?: string;
  synthetic?: boolean;
}

export const FACETS: Facet[] = ["technical", "career", "personal", "academic"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Shallow runtime check so a malformed response shows the error state instead of crashing the canvas. */
export function isGraphPayload(v: unknown): v is GraphPayload {
  return (
    isObj(v) &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.edges) &&
    v.nodes.every((n) => isObj(n) && typeof n.id === "string" && typeof n.type === "string") &&
    v.edges.every((e) => isObj(e) && typeof e.source === "string" && typeof e.target === "string")
  );
}

export function selfId(g: GraphPayload): string {
  return g.self_id ?? g.nodes.find((n) => n.type === "self")?.id ?? "me";
}

// GET /dashboard/{event_id}: organizer community map (docs/api.md 14). Anonymous: no names, groups >= 5.
export interface MapNode {
  id: string;
  x: number;
  y: number;
  cluster: number; // -1 = unclustered
  role?: string;
}
export interface MapCluster {
  id: number;
  label: string;
  size: number;
}
export interface MapEdge {
  source: string;
  target: string;
  created_at?: string;
}
export interface MapGap {
  clusters: [number, number];
  expected: number;
  actual: number;
  gap: number;
  ratio: number | null;
  labels?: [string, string];
}
export interface EventMap {
  nodes: MapNode[];
  clusters: MapCluster[];
  edges: MapEdge[];
  gaps: MapGap[];
  event_id?: number;
  event_name?: string;
  synthetic?: boolean;
  generated_at?: string;
  window?: { start: string; end: string };
  stats?: { attendees: number; connections: number; clusters: number };
}

export function isEventMap(v: unknown): v is EventMap {
  return isObj(v) && Array.isArray(v.nodes) && Array.isArray(v.clusters) && Array.isArray(v.edges) && Array.isArray(v.gaps);
}
