"""Delete leftover throwaway accounts created by the live test scripts (smoke/e2e/probe/load/rls), e.g. after a
run was killed before its cleanup. Only matches those exact email patterns and never touches seeded attendees.

    cd ml/scripts && npx @railway/cli run ../.venv/bin/python cleanup_test_accounts.py          # dry run
    cd ml/scripts && npx @railway/cli run ../.venv/bin/python cleanup_test_accounts.py --delete
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from e2e_profile_check import admin  # noqa: E402

PATTERN = r"^(smoke|e2e|probe|load|rls-[ab])-[0-9a-f]+@example\.com$"


def main():
    from app import db
    db.open_pool(os.environ["DATABASE_URL"], max_size=2)
    rows = db.fetchall(
        "select u.id::text as id, u.email, u.created_at from auth.users u left join profiles p on p.id = u.id "
        "where u.email ~ %s and not coalesce(p.is_synthetic, false) order by u.created_at", (PATTERN,))
    for r in rows:
        print(r["email"], r["created_at"])
    if "--delete" in sys.argv:
        for r in rows:
            print("deleted" if admin("DELETE", f"/admin/users/{r['id']}")[0] == 200 else "FAILED", r["email"])
    print(f"{len(rows)} test account(s){'' if '--delete' in sys.argv else ' (dry run; pass --delete)'}")


if __name__ == "__main__":
    main()
