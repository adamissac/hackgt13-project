"""One-use GPS-assisted QR exchange. Coordinates live only inside a 60s encrypted code."""
import base64
import hashlib
import hmac
import json
import math
import time

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, Field
from . import qr
from .errors import ApiError


class Fix(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy: float = Field(ge=0, le=25, allow_inf_nan=False)
    timestamp: float = Field(allow_inf_nan=False)  # Unix seconds
    mocked: bool = False


def fresh(fix: Fix, now: float) -> None:
    if fix.mocked or not -5 <= now - fix.timestamp <= 60:
        raise ApiError(400, "Get a fresh, accurate GPS location and try again")


def cipher() -> Fernet:
    key = hmac.new(qr._key(), b"constellation-gps-v1", hashlib.sha256).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def issue(user_id: str, fix: Fix) -> dict:
    fresh(fix, time.time())
    signed = qr.sign(user_id)
    token = cipher().encrypt(json.dumps({"qr": signed, "fix": fix.model_dump()}).encode()).decode()
    return {"code": token, "expires_at": signed["expires_at"]}


def check(code: str, fix: Fix) -> dict:
    now = time.time()
    fresh(fix, now)
    try:
        data = json.loads(cipher().decrypt(code.encode(), ttl=60))
        other = Fix.model_validate(data["fix"])
        signed = data["qr"]
    except (InvalidToken, ValueError, KeyError, TypeError):
        raise ApiError(400, "GPS code expired or invalid; ask for a new code")
    fresh(other, now)
    lat1, lat2 = map(math.radians, (fix.latitude, other.latitude))
    dlat = lat2 - lat1
    dlon = math.radians(other.longitude - fix.longitude)
    a = math.sin(dlat / 2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon / 2)**2
    distance = 6371000 * 2 * math.asin(math.sqrt(min(1, max(0, a))))
    # Inaccuracy must not expand the acceptance radius.
    if distance + fix.accuracy + other.accuracy > 50:
        raise ApiError(400, "Could not confirm you are nearby; move closer or get a clearer GPS signal")
    return signed
