"""Service settings, read once from environment variables (names listed in the root .env.example).

Nothing here has a real default for a secret. Missing secrets fail at the point of use, not at import,
so /health and the test suite run without them.
"""
import os
from dataclasses import dataclass, field

try:  # optional: load ml/.env or the repo-root .env for local runs
    from dotenv import load_dotenv

    _here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_here, "..", ".env"))
    load_dotenv(os.path.join(_here, "..", "..", ".env"))
except Exception:
    pass


def _env(name: str, default: str = "") -> str:
    """Empty values count as unset, so a copied .env.example keeps the defaults."""
    return os.getenv(name) or default


def _list(name: str, default: str) -> list[str]:
    return [s.strip() for s in _env(name, default).split(",") if s.strip()]


@dataclass(frozen=True)
class Settings:
    supabase_url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", "").rstrip("/"))
    # Legacy projects sign user JWTs with HS256 and this secret. Newer projects publish JWKS instead;
    # leave this empty and the service verifies against {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
    supabase_jwt_secret: str = field(default_factory=lambda: os.getenv("SUPABASE_JWT_SECRET", ""))
    supabase_service_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_KEY", ""))
    # Postgres connection string. On Supabase's transaction pooler (port 6543) prepared statements are
    # disabled automatically (see db.py).
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    qr_signing_key: str = field(default_factory=lambda: os.getenv("QR_SIGNING_KEY", ""))
    cors_origins: list[str] = field(default_factory=lambda: _list(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:8081,http://localhost:19006"))
    # Set RUN_WORKERS=0 to disable background loops (tests, a second replica).
    run_workers: bool = field(default_factory=lambda: _env("RUN_WORKERS", "1") == "1")
    # Set LOAD_EMBEDDER=0 to skip loading bge-small at startup (tests; falls back lazily).
    load_embedder: bool = field(default_factory=lambda: _env("LOAD_EMBEDDER", "1") == "1")

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1" if self.supabase_url else ""

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json" if self.supabase_url else ""


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Tests change env vars and call this."""
    global _settings
    _settings = None
