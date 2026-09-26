"""Supabase JWT verification.

Two modes, picked by configuration:
- SUPABASE_JWT_SECRET set: legacy HS256 shared secret.
- otherwise: asymmetric keys (ES256/RS256) from {SUPABASE_URL}/auth/v1/.well-known/jwks.json,
  fetched once and cached by PyJWKClient.

Both check signature, expiry, and audience "authenticated". The user id is the `sub` claim.
"""
from dataclasses import dataclass
import uuid

import jwt
from fastapi import Header

from .errors import ApiError
from .settings import get_settings

AUDIENCE = "authenticated"
_jwks_client: jwt.PyJWKClient | None = None


@dataclass(frozen=True)
class User:
    id: str          # uuid string (profiles.id)
    email: str | None = None
    provider: str | None = None   # sign-in method from app_metadata: "linkedin_oidc" | "email" | ...


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    s = get_settings()
    if not s.jwks_url:
        raise ApiError(500, "server auth is not configured (set SUPABASE_URL or SUPABASE_JWT_SECRET)")
    if _jwks_client is None or _jwks_client.uri != s.jwks_url:
        _jwks_client = jwt.PyJWKClient(s.jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_token(token: str) -> User:
    s = get_settings()
    options = {"require": ["exp", "sub"]}
    try:
        if s.supabase_jwt_secret:
            claims = jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"],
                                audience=AUDIENCE, options=options)
        else:
            key = _jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience=AUDIENCE,
                                issuer=s.jwt_issuer or None, options=options)
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "token expired")
    except jwt.PyJWKClientError:
        raise ApiError(401, "invalid token")
    except jwt.InvalidTokenError:
        raise ApiError(401, "invalid token")
    sub = claims.get("sub", "")
    try:
        uuid.UUID(sub)
    except (ValueError, TypeError):
        raise ApiError(401, "invalid token")
    app_meta = claims.get("app_metadata") or {}
    return User(id=sub, email=claims.get("email"), provider=app_meta.get("provider"))


def current_user(authorization: str | None = Header(default=None)) -> User:
    """FastAPI dependency. Every endpoint except /health depends on this."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "missing bearer token")
    return verify_token(authorization.split(" ", 1)[1].strip())
