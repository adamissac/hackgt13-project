"""Signed, short-lived, single-use verification QR payloads (MASTER_SPEC 7.4, 11).

payload   = base64url("<user_id>|<nonce>|<expires_at unix seconds>")
signature = base64url(HMAC-SHA256(QR_SIGNING_KEY, payload))
Nonce single use is enforced by the unique `handshakes.nonce` column at verify time.
"""
import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timezone

from .errors import ApiError
from .settings import get_settings

TTL_S = 60


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _key() -> bytes:
    k = get_settings().qr_signing_key
    if not k:
        raise ApiError(500, "QR signing is not configured")
    return k.encode()


def sign(user_id: str, now: float | None = None) -> dict:
    exp = int((now or time.time()) + TTL_S)
    payload = _b64(f"{user_id}|{secrets.token_urlsafe(16)}|{exp}".encode())
    sig = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    return {"payload": payload, "signature": sig,
            "expires_at": datetime.fromtimestamp(exp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


EVENT_TTL_S = 7 * 24 * 3600


def sign_event(event_id: int, now: float | None = None) -> dict:
    """Long-lived join QR for a company event. Scanning it registers and checks the person in."""
    exp = int((now or time.time()) + EVENT_TTL_S)
    payload = _b64(f"event|{int(event_id)}|{exp}".encode())
    sig = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    return {"payload": payload, "signature": sig,
            "expires_at": datetime.fromtimestamp(exp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def verify_event(payload: str, signature: str, now: float | None = None) -> int:
    expected = hmac.new(_key(), payload.encode(), hashlib.sha256).digest()
    try:
        ok = hmac.compare_digest(expected, _unb64(signature))
        kind, event_id, exp = _unb64(payload).decode().split("|")
        event_id = int(event_id)
        exp = int(exp)
    except Exception:
        raise ApiError(400, "invalid_signature")
    if not ok or kind != "event":
        raise ApiError(400, "invalid_signature")
    if (now or time.time()) > exp:
        raise ApiError(400, "expired")
    return event_id


def verify(payload: str, signature: str, now: float | None = None) -> tuple[str, str]:
    """Returns (user_id, nonce) or raises ApiError with a docs/api.md error code."""
    expected = hmac.new(_key(), payload.encode(), hashlib.sha256).digest()
    try:
        ok = hmac.compare_digest(expected, _unb64(signature))
        user_id, nonce, exp = _unb64(payload).decode().split("|")
        uuid.UUID(user_id)
        exp = int(exp)
    except Exception:
        raise ApiError(400, "invalid_signature")
    if not ok:
        raise ApiError(400, "invalid_signature")
    if (now or time.time()) > exp:
        raise ApiError(400, "expired")
    return user_id, nonce
