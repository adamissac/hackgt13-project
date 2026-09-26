"""GitHub OAuth for "Connect GitHub" (AR1). Framework-free helpers; the FastAPI routes call these.

Flow (agreed shape, recorded in docs/api.md once the routes land):
  1. App -> GET /connect/github/start  (Authorization: Bearer <supabase jwt>)
     <- {"url": "https://github.com/login/oauth/authorize?...&state=<signed>"}
     The phone opens that URL in a browser, which can't send headers, so the user id rides
     in a signed, 10-minute `state` instead.
  2. GitHub -> GET /connect/github/callback?code=...&state=...
     Verify state, exchange the code server-side, encrypt the token, upsert linked_accounts,
     then 302 to the app's deep link. The token never reaches the client.

Secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY (env only, server only).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
import urllib.request

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
SCOPE = "read:user"          # public repos only; never request `repo`
STATE_TTL_S = 600
CALLBACK_PATH = "/connect/github/callback"
DEFAULT_APP_REDIRECT = "formalconnection://connect/github"


class OAuthError(Exception):
    pass


def _env(name):
    v = os.getenv(name)
    if not v:
        raise OAuthError(f"{name} is not set")
    return v


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _subkey(label):
    """Derive independent keys from TOKEN_ENCRYPTION_KEY ('any long random string')."""
    return hmac.new(_env("TOKEN_ENCRYPTION_KEY").encode(), label.encode(), hashlib.sha256).digest()


# ---------------------------------------------------------------- token encryption (Fernet)
def _fernet():
    from cryptography.fernet import Fernet
    return Fernet(base64.urlsafe_b64encode(_subkey("fernet:linked_accounts")))


def encrypt_token(token):
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(token_enc):
    return _fernet().decrypt(token_enc.encode()).decode()


# ---------------------------------------------------------------- signed state
def make_state(user_id, now=None):
    now = int(now if now is not None else time.time())
    body = _b64(json.dumps({"u": user_id, "exp": now + STATE_TTL_S, "n": secrets.token_urlsafe(8)},
                           separators=(",", ":")).encode())
    sig = _b64(hmac.new(_subkey("oauth-state:github"), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_state(state, now=None):
    """Return the user_id the state was issued to, or raise OAuthError."""
    try:
        body, sig = state.split(".", 1)
    except (AttributeError, ValueError):
        raise OAuthError("malformed state")
    want = _b64(hmac.new(_subkey("oauth-state:github"), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, want):
        raise OAuthError("invalid state signature")
    data = json.loads(_unb64(body))
    if int(now if now is not None else time.time()) > data["exp"]:
        raise OAuthError("state expired")
    return data["u"]


# ---------------------------------------------------------------- URLs and exchange
def callback_url():
    return _env("ML_API_URL").rstrip("/") + CALLBACK_PATH


def authorize_url(user_id):
    q = {"client_id": _env("GITHUB_CLIENT_ID"), "redirect_uri": callback_url(), "scope": SCOPE,
         "state": make_state(user_id), "allow_signup": "false"}
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(q)}"


def exchange_code(code):
    """Server-side code -> {"access_token", "scope", "token_type"}."""
    data = urllib.parse.urlencode({"client_id": _env("GITHUB_CLIENT_ID"),
                                   "client_secret": _env("GITHUB_CLIENT_SECRET"),
                                   "code": code, "redirect_uri": callback_url()}).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, headers={"Accept": "application/json",
                                                                "User-Agent": "formal-connection"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        out = json.loads(resp.read())
    if "access_token" not in out:
        # GitHub returns 200 with {"error": "bad_verification_code", ...} on failure
        raise OAuthError(out.get("error", "token exchange failed"))
    return out


def app_redirect(status):
    """Deep link back into the app after the callback: status is 'ok' or a short error code."""
    base = os.getenv("APP_GITHUB_REDIRECT", DEFAULT_APP_REDIRECT)
    return f"{base}?{urllib.parse.urlencode({'status': status})}"


def linked_account_row(user_id, token_response, github_login):
    """Row for linked_accounts (docs/schema.sql). Only the encrypted token is stored."""
    return {"user_id": user_id, "provider": "github", "provider_uid": github_login,
            "access_token_enc": encrypt_token(token_response["access_token"]),
            "refresh_token_enc": None, "scopes": token_response.get("scope", SCOPE),
            "fetched_at": None}
