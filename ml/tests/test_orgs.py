from app import orgs


def test_join_code_hash_ignores_dashes_and_case():
    assert orgs.hash_join_code("ab1-c23") == orgs.hash_join_code("AB1C23")
    assert orgs.hash_join_code("ab1c23") == orgs.hash_join_code("AB1-C23")


def test_new_join_code_shape():
    code = orgs.new_join_code()
    assert "-" in code
    assert len(code.replace("-", "")) == 6
    assert orgs.hash_join_code(code) == orgs.hash_join_code(code.replace("-", "").lower())


def test_parse_ts_accepts_human_times():
    assert orgs.parse_ts("") is None
    assert orgs.parse_ts("2026-09-27 18:00") == "2026-09-27T18:00:00"
    assert orgs.parse_ts("2026-09-27T18:00:00") == "2026-09-27T18:00:00"
