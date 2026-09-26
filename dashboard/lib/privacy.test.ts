import { describe, expect, it } from "vitest";
import matches from "../public/mocks/graph_matches.json";
import network from "../public/mocks/graph_network.json";
import expand from "../public/mocks/graph_expand.json";
import { enforceGraphPrivacy, mergeGraph } from "./privacy";
import { isGraphPayload, type GraphPayload, type PersonNode } from "./types";

const person = (id: string, extra: Partial<PersonNode> = {}): PersonNode => ({
  id,
  type: "person",
  label: id,
  score: 0.5,
  highlight: false,
  open_to_meet: false,
  cluster: null,
  connected: false,
  connected_at: null,
  top_topic: "chess",
  ...extra,
});

describe("graph privacy (MASTER_SPEC 3.12 hard rules)", () => {
  it("mocks are valid /graph payloads", () => {
    for (const g of [matches, network, expand]) expect(isGraphPayload(g)).toBe(true);
  });

  it("drops edges between two people (no second-degree person edges)", () => {
    const g: GraphPayload = {
      nodes: [{ id: "me", type: "self", label: "You" }, person("u_1", { connected: true }), person("u_2", { connected: true })],
      edges: [
        { source: "me", target: "u_1", kind: "connection", weight: 1 },
        { source: "u_1", target: "u_2", kind: "connection", weight: 1 },
      ],
      mode: "network",
    };
    const out = enforceGraphPrivacy(g);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].target).toBe("u_1");
  });

  it("drops match/connection edges that don't touch the viewer, and edges to unknown nodes", () => {
    const g: GraphPayload = {
      nodes: [{ id: "me", type: "self", label: "You" }, person("u_1"), { id: "t_1", type: "topic", label: "chess", facet: "personal" }],
      edges: [
        { source: "t_1", target: "u_1", kind: "match", weight: 1 },
        { source: "me", target: "u_404", kind: "match", weight: 1 },
        { source: "u_1", target: "t_1", kind: "has_topic", weight: 1 },
      ],
    };
    expect(enforceGraphPrivacy(g).edges).toEqual([{ source: "u_1", target: "t_1", kind: "has_topic", weight: 1 }]);
  });

  it("My Network never shows people who aren't your connections", () => {
    const g: GraphPayload = {
      nodes: [{ id: "me", type: "self", label: "You" }, person("u_1", { connected: true }), person("u_2")],
      edges: [
        { source: "me", target: "u_1", kind: "connection", weight: 1 },
        { source: "me", target: "u_2", kind: "match", weight: 1 },
      ],
      mode: "network",
    };
    const merged = mergeGraph(g, { nodes: [person("u_3")], edges: [{ source: "me", target: "u_3", kind: "match", weight: 1 }] });
    const ids = merged.nodes.map((n) => n.id);
    expect(ids).toEqual(["me", "u_1"]);
    expect(merged.edges.every((e) => e.kind === "connection")).toBe(true);
  });

  it("merge adds expanded people without duplicating existing nodes", () => {
    const base = enforceGraphPrivacy({ ...(matches as GraphPayload), mode: "matches" });
    const merged = mergeGraph(base, expand as GraphPayload);
    const people = (g: GraphPayload) => g.nodes.filter((n) => n.type === "person").length;
    expect(people(merged)).toBe(people(base) + 2);
    expect(new Set(merged.nodes.map((n) => n.id)).size).toBe(merged.nodes.length);
  });

  it("mock network payload: every person is a connection", () => {
    const out = enforceGraphPrivacy(network as GraphPayload);
    expect(out.nodes.filter((n) => n.type === "person").length).toBe(
      (network as GraphPayload).nodes.filter((n) => n.type === "person").length,
    );
  });
});
