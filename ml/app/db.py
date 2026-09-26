"""Postgres access: one psycopg 3 connection pool with the pgvector adapter registered.

The service connects with DATABASE_URL (a Postgres role that bypasses RLS), so every query here
must enforce scope itself: always filter by the caller's user id or an allowed set.
"""
from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .errors import ApiError
from .settings import get_settings

_pool: ConnectionPool | None = None


def _configure(conn: psycopg.Connection) -> None:
    try:
        from pgvector.psycopg import register_vector
        register_vector(conn)
    except psycopg.ProgrammingError:
        pass  # vector extension not installed yet; vector queries will fail loudly later
    conn.commit()


def _uses_transaction_pooler(url: str) -> bool:
    try:
        return urlparse(url).port == 6543
    except ValueError:
        return False


def open_pool(url: str | None = None, min_size: int = 1, max_size: int = 10) -> ConnectionPool:
    global _pool
    url = url or get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    kwargs: dict[str, Any] = {"row_factory": dict_row}
    if _uses_transaction_pooler(url):
        kwargs["prepare_threshold"] = None  # prepared statements break on Supabase's pgbouncer
    _pool = ConnectionPool(url, min_size=min_size, max_size=max_size, kwargs=kwargs,
                           configure=_configure, open=True, check=ConnectionPool.check_connection)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def pool() -> ConnectionPool:
    if _pool is None:
        raise ApiError(503, "database is not configured")
    return _pool


def is_open() -> bool:
    return _pool is not None


@contextmanager
def conn() -> Iterator[psycopg.Connection]:
    """A pooled connection inside a transaction (commits on success, rolls back on error)."""
    with pool().connection() as c:
        yield c


def fetchall(sql: str, params: Any = None) -> list[dict]:
    with conn() as c:
        return c.execute(sql, params).fetchall()


def fetchone(sql: str, params: Any = None) -> dict | None:
    with conn() as c:
        return c.execute(sql, params).fetchone()


def execute(sql: str, params: Any = None) -> None:
    with conn() as c:
        c.execute(sql, params)


def ping() -> bool:
    try:
        return fetchone("select 1 as ok")["ok"] == 1
    except Exception:
        return False
