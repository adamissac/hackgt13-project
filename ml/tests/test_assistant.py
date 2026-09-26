"""AL11: the assistant's tools enforce scope in Python, whatever the model asks for."""
import json
from types import SimpleNamespace as NS

import pytest

from conftest import add_event, auth, seed_person


@pytest.fixture
def world(db):
    ev = add_event(db)
    other_ev = add_event(db, "Other Fair")
    me = seed_person(db, "Maya Rao", [("quantitative finance", "career", 0.9), ("python", "technical", 0.6)], event_id=ev)
    quant = seed_person(db, "Quinn Ames", [("quantitative finance", "career", 0.8)], role="recruiter", event_id=ev)
    closed = seed_person(db, "Cal Doe", [("quantitative finance", "career", 0.9)], event_id=ev)       # Open to Meet off
    elsewhere = seed_person(db, "Eli West", [("quantitative finance", "career", 0.9)], event_id=other_ev)
    friend = seed_person(db, "Fay Lin", [("python", "technical", 0.8)])
    fof = seed_person(db, "Gus Hale", [("python", "technical", 0.8)])
    db.execute("update profiles set open_to_meet = true where id = any(%s::uuid[])", ([quant, elsewhere],))
    for x, y in ((me, friend), (friend, fof)):
        lo, hi = sorted([x, y])
        db.execute("insert into connections (user_a, user_b) values (%s, %s)", (lo, hi))
    db.execute("insert into feed_items (author_id, kind, body) values (%s, 'post', 'shipped a pandas plugin'), "
               "(%s, 'post', 'secret stuff from a stranger')", (friend, fof))
    return dict(ev=ev, other_ev=other_ev, me=me, quant=quant, closed=closed, elsewhere=elsewhere, friend=friend, fof=fof)


def test_search_only_open_attendees_of_my_event(db, world):
    from app.assistant import Tools
    t = Tools(world["me"])
    out = t.search_event_attendees(world["ev"], "quant")
    assert [r["user_id"] for r in out["results"]] == [world["quant"]]          # Cal is not Open to Meet
    assert set(out["results"][0]) == {"user_id", "first_name", "role", "matching_topics", "shared_topics_with_user"}
    assert out["results"][0]["first_name"] == "Quinn"
    assert t.search_event_attendees(world["other_ev"], "quant") == {"error": "the user is not checked in to that event"}


def test_profile_only_for_allowed_people(db, world):
    from app.assistant import Tools
    t = Tools(world["me"])
    assert t.get_match_profile(world["quant"])["name"] == "Quinn Ames"
    assert t.get_match_profile(world["friend"])["connected"] is True
    for stranger in (world["elsewhere"], world["fof"], "not-a-uuid", world["me"]):
        assert t.get_match_profile(stranger) == {"error": "not available"}


def test_activity_is_my_connections_only(db, world):
    from app.assistant import Tools
    items = Tools(world["me"]).get_connections_activity(7)["items"]
    assert [i["body"] for i in items] == ["shipped a pandas plugin"]
    assert Tools(world["me"]).get_connections_activity(999)["days"] == 14


def test_no_tool_output_contains_connection_lists_or_counts(db, world):
    from app.assistant import Tools
    t = Tools(world["me"])
    blob = json.dumps([t.get_match_profile(world["friend"]), t.get_my_profile(),
                       t.get_connections_activity(14), t.search_event_attendees(world["ev"], "finance")], default=str)
    assert world["fof"] not in blob and "Gus" not in blob and "connections" not in blob.lower().replace(
        "connections_activity", "")


class FakeClient:
    """Plays an adversarial model: calls the tools it is scripted to, then answers with what it got."""
    def __init__(self, script):
        self.script, self.seen = list(script), []
        self.messages = self

    def create(self, **kw):
        if kw["messages"][-1]["role"] == "user" and isinstance(kw["messages"][-1]["content"], list):
            self.seen.extend(json.loads(r["content"]) for r in kw["messages"][-1]["content"])
        usage = NS(input_tokens=1, output_tokens=1)
        if self.script:
            name, args = self.script.pop(0)
            return NS(stop_reason="tool_use", usage=usage,
                      content=[NS(type="tool_use", id=f"t{len(self.script)}", name=name, input=args)])
        return NS(stop_reason="end_turn", usage=usage, content=[NS(type="text", text=json.dumps(self.seen))])


def test_adversarial_asks_get_nothing_extra(dbclient, db, world, monkeypatch):
    from app import assistant
    fake = FakeClient([("get_match_profile", {"user_id": world["fof"]}),               # "what is Gus working on"
                       ("search_event_attendees", {"event_id": world["other_ev"], "topic": "quant"}),   # list everyone
                       ("get_match_profile", {"user_id": world["elsewhere"]})])
    monkeypatch.setattr(assistant, "_client", lambda: fake)
    r = dbclient.post("/assistant/chat", headers=auth(world["me"]),
                      json={"messages": [{"role": "user", "content": "How many connections does Fay have and who?"}]})
    assert r.status_code == 200
    reply = r.json()["reply"]
    assert world["fof"] not in reply and "Eli" not in reply and "Gus" not in reply
    assert fake.seen == [{"error": "not available"}, {"error": "the user is not checked in to that event"},
                         {"error": "not available"}]


def test_prompt_rules_and_unavailable(dbclient, world, monkeypatch):
    from app import assistant
    assert "Never reveal or estimate anyone's number of connections" in assistant.SYSTEM
    assert "declined" in assistant.SYSTEM
    monkeypatch.setattr(assistant, "_client", lambda: (_ for _ in ()).throw(RuntimeError("no key")))
    r = dbclient.post("/assistant/chat", headers=auth(world["me"]), json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503 and r.json() == {"error": "the assistant is unavailable right now"}
