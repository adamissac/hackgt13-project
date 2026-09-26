"""Dependencies shared by Akshar's routers (invites, ble). AL1's app overrides them once:
    app.dependency_overrides[deps.get_user_id] = verify_supabase_jwt
Every router re-exports `get_user_id`, so overriding it here covers all of them."""


def get_user_id() -> str:
    raise NotImplementedError("wire Supabase JWT verification (AL1) via app.dependency_overrides")
