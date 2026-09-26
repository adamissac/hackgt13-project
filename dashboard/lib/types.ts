// /graph payload. PROVISIONAL: mirrors docs/mocks/graph_*.json until MASTER_SPEC Section 9 lands.

export type Facet = "technical" | "career" | "personal" | "academic";
export type GraphMode = "matches" | "network";
export type Role = "student" | "recruiter";

export interface SelfNode {
  id: string;
  type: "self";
  label: string;
  role: Role;
}

export interface PersonNode {
  id: string;
  type: "person";
  label: string;
  role: Role;
  score: number;
  why: string[];
  top_topic: string;
  topics: string[];
  photo_url: string | null;
  // matches mode
  rank?: number;
  highlight?: boolean;
  open_to_meet?: boolean;
  // network mode
  connected_at?: string;
  met_at?: string;
  via?: "in_person" | "invite";
}

export interface TopicNode {
  id: string;
  type: "topic";
  label: string;
  facet: Facet;
  idf: number;
}

export type GraphNode = SelfNode | PersonNode | TopicNode;

export type LinkKind = "interest" | "suggested" | "connection";

export interface GraphLink {
  source: string;
  target: string;
  kind: LinkKind;
  weight: number;
  facet?: Facet;
}

export interface GraphPayload {
  mode: GraphMode;
  event_id: number;
  self_id: string;
  generated_at: string;
  synthetic?: boolean;
  nodes: GraphNode[];
  links: GraphLink[];
}

export const FACETS: Facet[] = ["technical", "career", "personal", "academic"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Shallow runtime check so a malformed response shows the error state instead of crashing the canvas. */
export function isGraphPayload(v: unknown): v is GraphPayload {
  return (
    isObj(v) &&
    typeof v.self_id === "string" &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.links) &&
    v.nodes.every((n) => isObj(n) && typeof n.id === "string" && typeof n.type === "string")
  );
}
