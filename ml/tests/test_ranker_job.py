"""AL9: retraining script labels its data source; real rows come only from verified, non-synthetic pairs."""
import json

from conftest import add_event, auth, seed_person


def test_synthetic_report_is_labeled(tmp_path):
    from app import ranker_job
    rep = ranker_job.train("synthetic", n_synthetic=60, clusters=False, out_dir=tmp_path)
    assert rep["data"] == "simulated outcomes" and rep["trained"]
    assert set(rep["AUC"]) == {"v1_hand_tuned", "logistic_regression", "lgbm_lambdarank"}
    assert json.loads((tmp_path / "ranker_report.json").read_text())["data"] == "simulated outcomes"
    assert (tmp_path / "ranker_lr.pkl").exists()


def test_real_rows_exclude_synthetic_and_need_enough_data(db, tmp_path):
    from app import ranker_job
    a = seed_person(db, "A", [("robotics", "technical", 0.9)])
    b = seed_person(db, "B", [("robotics", "technical", 0.9)])
    s = seed_person(db, "S", [("robotics", "technical", 0.9)])
    db.execute("update profiles set is_synthetic = true where id = %s", (s,))
    for x, y, yes in ((a, b, True), (a, s, True)):
        lo, hi = sorted([x, y])
        cid = db.fetchone("insert into conversations (user_a, user_b, method, minutes) values (%s, %s, 'qr', 10) "
                          "returning id", (lo, hi))["id"]
        for r in (lo, hi):
            db.execute("insert into feedback (conversation_id, rater_id, wants_connect) values (%s, %s, %s)",
                       (cid, r, yes))
    rows, by_id, index = ranker_job.real_rows()
    assert {(r["viewer"], r["other"]) for r in rows} == {(a, b), (b, a)}      # synthetic pair excluded
    assert all(r["y"] == 1 and r["rel"] == 2 for r in rows)
    rep = ranker_job.train("real", out_dir=tmp_path)
    assert rep["data"] == "real outcomes" and rep["trained"] is False and rep["real_data"]["pairs"] == 1


def test_serving_switch(dbclient, db, monkeypatch, tmp_path):
    from app import ranker_job
    ranker_job.train("synthetic", n_synthetic=60, clusters=False, out_dir=tmp_path)
    monkeypatch.setattr(ranker_job, "DATA_DIR", tmp_path)
    ev = add_event(db)
    me = seed_person(db, "Me", [("robotics", "technical", 0.9)], event_id=ev)
    seed_person(db, "O", [("robotics", "technical", 0.9)], event_id=ev)
    assert dbclient.get(f"/events/{ev}/matches", headers=auth(me)).json()["model"] == "v1"
    monkeypatch.setenv("MATCH_MODEL", "lr")
    body = dbclient.get(f"/events/{ev}/matches", headers=auth(me)).json()
    assert body["model"] == "lr" and 0 <= body["matches"][0]["score"] <= 1
    assert db.fetchone("select model from impressions order by id desc limit 1")["model"] == "lr"
