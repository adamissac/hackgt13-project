"""Connection Graph data (MASTER_SPEC 3.12, 9, 10). Privacy is structural:

- Person nodes are only people the viewer may already see: current allowed matches (matches mode) or the
  viewer's own connections (network mode).
- Edges are only me->person and (me|person)->topic. There is no code path that emits a person->person edge,
  so two connections are never linked and nobody's connections are revealed.
- Names are first names only; no connection counts for anyone.

Node ids: "me", "u_<uuid>", "t_<interest id>".
"""
import os

from ml import generation, scoring
from ml.config import FACETS

from . import db, matching, population

MAX_NODES = 150
TOPICS_PER_PERSON = 3
# A graph can hold 150 people but a user only reads a handful of summaries. Varying the strongest
# edges keeps one Haiku call bounded (~6 s for 8) instead of scaling with the whole screen.
MAX_VARIED = 10
_varied_cache: dict[tuple[str, str], str] = {}      # (person node id, template) -> varied sentence


def _vocabulary(index) -> set[str]:
    """Lowercased interest names. The live index keys names by interest id (dict); the ml/ one is a list."""
    names = index.names.values() if isinstance(index.names, dict) else index.names
    return {n.lower() for n in names}


def first_name(name: str | None) -> str:
    return (name or "").split(" ")[0] or "Someone"


def dominant_facet(features: dict) -> str:
    return max(FACETS, key=lambda f: features.get(f"sim_{f}", 0.0))


class Builder:
    def __init__(self, me: dict, index):
        self.me, self.index = me, index
        self.nodes: dict[str, dict] = {"me": {"id": "me", "type": "self", "label": "You"}}
        self.edges: dict[tuple, dict] = {}

    def topic(self, iid: int, evidence: str | None = None) -> str:
        nid = f"t_{iid}"
        if nid not in self.nodes:
            self.nodes[nid] = {"id": nid, "type": "topic", "label": self.index.names[iid],
                               "facet": self.index.facets[iid]}
        if evidence is not None:
            self.nodes[nid]["evidence"] = evidence
        return nid

    def edge(self, source: str, target: str, kind: str, weight: float, facet: str | None = None,
             explanation: dict | None = None) -> None:
        e = {"source": source, "target": target, "kind": kind, "weight": round(float(weight), 4)}
        if facet:
            e["facet"] = facet
        if explanation is not None:
            e["explanation"] = explanation
        self.edges[(source, target)] = e

    def person(self, p: dict, *, score: float, features: dict, highlight: bool, cluster, connected: bool,
               connected_at, facet_filter: str, topics_k: int = TOPICS_PER_PERSON,
               explanation: dict | None = None) -> bool:
        shared = scoring.shared_interests(self.me, p, self.index, 20)
        if facet_filter != "all":
            shared = [s for s in shared if self.index.facets[s["id"]] == facet_filter]
            if not shared:
                return False
        nid = f"u_{p['id']}"
        self.nodes[nid] = {"id": nid, "type": "person", "label": first_name(p.get("name")),
                           "score": round(float(score), 4), "highlight": bool(highlight),
                           "open_to_meet": bool(p.get("open_to_meet")), "cluster": cluster,
                           "connected": connected, "connected_at": connected_at,
                           "top_topic": shared[0]["name"] if shared else None, "shared_count": len(shared)}
        self.edge("me", nid, "connection" if connected else "match", score, dominant_facet(features),
                  explanation=self.explanation(p, features, explanation))
        for s in shared[:topics_k]:
            t = self.topic(s["id"])
            self.edge(nid, t, "has_topic", p["interests"][s["id"]]["weight"])
            self.edge("me", t, "has_topic", self.me["interests"][s["id"]]["weight"])
        return True

    def explanation(self, p: dict, features: dict, ranked: dict | None = None) -> dict:
        """Why-you-matched for the me->person edge, trimmed for a graph that can hold 150 nodes.

        Only the summary, the top factors (enough to draw a small bar), and topic names. The full
        breakdown with evidence lines is on GET /matches/{id}/quick-profile and expand(); repeating
        it per edge would multiply the payload for data the graph never renders.
        """
        e = ranked if ranked is not None else scoring.explain_match(self.me, p, self.index, features=features)
        return {"summary": e["summary"], "basis": e["basis"],
                "factors": [{"label": r["label"], "contribution": r["contribution"], "share": r["share"]}
                            for r in e["factors"]],
                "shared_topics": [t["name"] for t in e["shared_topics"][:3]]}

    def people_count(self) -> int:
        return sum(1 for n in self.nodes.values() if n["type"] == "person")

    def vary_summaries(self, edges: list[dict]) -> None:
        """Rewrite the template summaries in varied prose, in ONE batched Haiku call per request.

        The templates repeat across a screenful of matches, which reads robotically. This only ever
        replaces `summary`; the factors and their contributions are untouched, so the numbers a judge
        sees are still the ranker's. Anything the model omits or that names an interest the pair does
        not share keeps its template. Set EXPLAIN_VARY=0 to turn it off entirely.
        """
        if os.getenv("EXPLAIN_VARY", "1") != "1":
            return
        with_ex = [e for e in edges if e.get("explanation")]
        # Serve anything already rewritten this process; a judge reopening the graph pays nothing.
        todo = []
        for e in with_ex:
            hit = _varied_cache.get((e["target"], e["explanation"]["summary"]))
            if hit:
                e["explanation"].update(summary=hit, varied=True)
            else:
                todo.append(e)
        todo.sort(key=lambda e: -e["weight"])
        todo = todo[:MAX_VARIED]
        if not todo:
            return
        items = [{"id": e["target"], "template": e["explanation"]["summary"],
                  "topics": e["explanation"]["shared_topics"],
                  "factors": [f["label"] for f in e["explanation"]["factors"]],
                  "bridge": "different circles" in e["explanation"]["summary"],
                  "recruiter": "hiring" in e["explanation"]["summary"]} for e in todo]
        varied = generation.vary_why(items, vocabulary=_vocabulary(self.index))
        for e in todo:
            s = varied.get(e["target"])
            if s:
                _varied_cache[(e["target"], e["explanation"]["summary"])] = s
                e["explanation"].update(summary=s, varied=True)

    def out(self) -> dict:
        nodes = list(self.nodes.values())[:MAX_NODES]
        keep = {n["id"] for n in nodes}
        edges = [e for e in self.edges.values() if e["source"] in keep and e["target"] in keep]
        self.vary_summaries([e for e in edges if e["kind"] in ("match", "connection")])
        return {"nodes": nodes, "edges": edges}


# ------------------------------------------------------------------ matches mode
def matches_graph(viewer: str, event_id: int, depth: int, max_people: int, min_score: float, facet: str) -> dict:
    ranked, m = matching.rank_for_viewer(viewer, event_id, explore_eps=0.0)
    b = Builder(m.people[viewer], m.index)
    allowed = [r for r in ranked if r["score"] >= min_score]
    for r in allowed:
        if b.people_count() >= max_people:
            break
        b.person(m.people[r["id"]], score=r["score"], features=r["features"], highlight=r["highlight"],
                 cluster=(m.cluster or {}).get(r["id"]), connected=False, connected_at=None, facet_filter=facet,
                 explanation=r.get("explanation"))
    if depth >= 2:   # also expand through the shared topics already on screen
        topic_ids = [int(n["id"][2:]) for n in list(b.nodes.values()) if n["type"] == "topic"]
        for iid in topic_ids:
            for r in allowed:
                if b.people_count() >= max_people:
                    break
                if f"u_{r['id']}" in b.nodes or iid not in m.people[r["id"]]["interests"]:
                    continue
                b.person(m.people[r["id"]], score=r["score"], features=r["features"], highlight=r["highlight"],
                         cluster=(m.cluster or {}).get(r["id"]), connected=False, connected_at=None,
                         facet_filter=facet, explanation=r.get("explanation"))
    return b.out()


# ------------------------------------------------------------------ network mode
def my_connections(viewer: str) -> list[dict]:
    return db.fetchall(
        "select case when user_a = %s then user_b else user_a end::text as id, created_at from connections "
        "where user_a = %s or user_b = %s order by created_at", (viewer, viewer, viewer))


def network_graph(viewer: str, max_people: int, min_score: float, facet: str) -> dict:
    conns = my_connections(viewer)
    people, index = population.build([viewer] + [c["id"] for c in conns])
    by_id = {p["id"]: p for p in people}
    me = by_id.get(viewer)
    if me is None:
        return {"nodes": [{"id": "me", "type": "self", "label": "You"}], "edges": []}
    b = Builder(me, index)
    for c in conns:
        if b.people_count() >= max_people:
            break
        p = by_id.get(c["id"])
        if p is None:
            continue
        score, f = matching.pair_score(me, p, index)
        if score < min_score:
            continue
        b.person(p, score=score, features=f, highlight=False, cluster=None, connected=True,
                 connected_at=c["created_at"].isoformat(), facet_filter=facet)
    return b.out()


# ------------------------------------------------------------------ expand
def expand(viewer: str, node_id: str, mode: str, event_id: int | None, limit: int = 10) -> dict:
    if node_id.startswith("t_") and node_id[2:].isdigit():
        iid = int(node_id[2:])
        if mode == "network":
            g = network_graph(viewer, max_people=MAX_NODES, min_score=-1, facet="all")
            keep = {e["source"] for e in g["edges"] if e["target"] == node_id and e["source"].startswith("u_")}
            nodes = [n for n in g["nodes"] if n["id"] in keep or n["id"] in ("me", node_id)]
            return {"nodes": nodes, "edges": [e for e in g["edges"]
                                              if e["source"] in {n["id"] for n in nodes} and e["target"] in {n["id"] for n in nodes}]}
        ranked, m = matching.rank_for_viewer(viewer, event_id, explore_eps=0.0)
        b = Builder(m.people[viewer], m.index)
        holders = [r for r in ranked if iid in m.people[r["id"]]["interests"]][:limit]   # ranked by score
        for r in holders:
            p = m.people[r["id"]]
            b.person(p, score=r["score"], features=r["features"], highlight=r["highlight"],
                     cluster=(m.cluster or {}).get(r["id"]), connected=False, connected_at=None, facet_filter="all",
                     topics_k=0, explanation=r.get("explanation"))
            b.edge(f"u_{p['id']}", b.topic(iid), "has_topic", p["interests"][iid]["weight"])
        return b.out()
    if node_id.startswith("u_") and matching.is_valid_uuid(node_id[2:]):
        other = node_id[2:]
        rel = matching.relationship(viewer, other)
        if rel is None:
            return {"nodes": [], "edges": []}
        me, them, index, cluster = population.pair_model(viewer, other, rel["event_id"] or event_id)
        b = Builder(me, index)
        for s in scoring.shared_interests(me, them, index, 20):
            t = b.topic(s["id"], evidence=s["evidence_b"])      # their evidence line, never their connections
            b.edge(node_id, t, "has_topic", them["interests"][s["id"]]["weight"])
        b.nodes.pop("me")
        return b.out()
    return {"nodes": [], "edges": []}
