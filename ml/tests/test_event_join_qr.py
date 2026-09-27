"""Company event join QR signs and verifies (no database)."""
from app import qr
from app.errors import ApiError


def test_event_join_roundtrip():
    token = qr.sign_event(7, now=1_700_000_000)
    assert qr.verify_event(token["payload"], token["signature"], now=1_700_000_000) == 7


def test_event_join_rejects_user_qr():
    user = qr.sign("00000000-0000-0000-0000-00000000000a", now=1_700_000_000)
    try:
        qr.verify_event(user["payload"], user["signature"], now=1_700_000_000)
        assert False, "user QR must not join an event"
    except ApiError as e:
        assert e.message == "invalid_signature"
