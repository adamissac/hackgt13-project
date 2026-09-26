"""Background loops, started in the FastAPI lifespan (MASTER_SPEC 4.3: no separate queue).

Each job is a plain sync function run in a thread on a fixed interval. A failing job logs and
tries again next tick; it never kills the loop. Jobs register themselves with @every(seconds).
"""
import asyncio
import logging
from typing import Callable

log = logging.getLogger("workers")

JOBS: list[tuple[str, float, Callable[[], None]]] = []


def every(seconds: float, name: str | None = None):
    def deco(fn: Callable[[], None]):
        JOBS.append((name or fn.__name__, seconds, fn))
        return fn
    return deco


async def _loop(name: str, seconds: float, fn: Callable[[], None]) -> None:
    while True:
        try:
            await asyncio.to_thread(fn)
        except Exception:  # keep looping; the next tick may succeed
            log.exception("worker %s failed", name)
        await asyncio.sleep(seconds)


def start() -> list[asyncio.Task]:
    return [asyncio.create_task(_loop(n, s, f), name=f"worker:{n}") for n, s, f in JOBS]


async def stop(tasks: list[asyncio.Task]) -> None:
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
