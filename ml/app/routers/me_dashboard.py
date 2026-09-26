"""GET /me/dashboard: private personal dashboard (MASTER_SPEC 3.11, 9, 10; AR7, owner Arjun).

Only the caller's own connections, ever (MASTER_SPEC 1.3, 11): nobody else's count or list is computed here.
- growth: cumulative connections per day (line chart)
- how_met: in person vs private invite (donut)
- top_topics: topics you connect over most = how many of your connections share it, plus how many
  conversations you checked it as discussed (bars)
"""
from fastapi import APIRouter, Depends, Query

from .. import db
from ..auth import User, current_user
from ..users import ensure_profile

router = APIRouter(prefix="/me")
TOP_TOPICS = 8


@router.get("/dashboard")
def my_dashboard(days: int = Query(30, ge=1, le=365), user: User = Depends(current_user)):
    ensure_profile(user.id)
    mine = db.fetchall(
        "select case when user_a = %(u)s then user_b else user_a end::text as other, created_at, "
        "coalesce(how_met, 'in_person') as how_met from connections "
        "where user_a = %(u)s or user_b = %(u)s order by created_at", {"u": user.id})

    growth, total = [], 0
    by_day: dict[str, int] = {}
    for r in mine:
        d = r["created_at"].date().isoformat()
        by_day[d] = by_day.get(d, 0) + 1
    days_rows = db.fetchall(
        "select d::date::text as date from generate_series(current_date - make_interval(days => %s - 1), "
        "current_date, interval '1 day') d", (days,))
    before = sum(1 for r in mine if r["created_at"].date().isoformat() < (days_rows[0]["date"] if days_rows else ""))
    total = before
    for row in days_rows:
        total += by_day.get(row["date"], 0)
        growth.append({"date": row["date"], "total": total})

    how_met = {"in_person": 0, "invite": 0}
    for r in mine:
        how_met["invite" if r["how_met"] == "invite" else "in_person"] += 1

    top = []
    if mine:
        top = db.fetchall(
            "with mine as (select case when user_a = %(u)s then user_b else user_a end as other from connections "
            "              where user_a = %(u)s or user_b = %(u)s), "
            "shared as (select ui.interest_id, count(*) as n from user_interests me "
            "           join user_interests ui on ui.interest_id = me.interest_id and ui.user_id in (select other from mine) "
            "           where me.user_id = %(u)s and not me.hidden and not ui.hidden group by ui.interest_id), "
            "talked as (select unnest(f.talked_about) as interest_id, count(*) as n from feedback f "
            "           where f.rater_id = %(u)s group by 1) "
            "select i.canonical_name as name, i.facet, coalesce(s.n, 0)::int as connections, coalesce(t.n, 0)::int as talked "
            "from interests i left join shared s on s.interest_id = i.id left join talked t on t.interest_id = i.id "
            "where s.n is not null or t.n is not null "
            "order by coalesce(t.n, 0) + coalesce(s.n, 0) desc, i.canonical_name limit %(k)s",
            {"u": user.id, "k": TOP_TOPICS})

    return {"total": len(mine), "growth": growth, "how_met": how_met, "top_topics": top, "days": days}
