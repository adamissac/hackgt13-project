"""FastAPI entry point for the ML service.

Run locally:   cd ml && uvicorn app.main:app --reload --port 8000
Adding a router (any owner): create app/routers/<area>.py exposing `router = APIRouter()`,
then add "<area>" to ROUTERS below. Every endpoint except /health must depend on auth.current_user.
"""
import importlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, errors, workers
from .settings import get_settings

log = logging.getLogger("app")

# One module per area in app/routers/. Order does not matter.
ROUTERS = ["health", "profile"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if s.database_url and not db.is_open():
        try:
            db.open_pool()
        except Exception:
            log.exception("could not open the database pool; DB endpoints will return 503")
    if s.load_embedder:
        from ml.embed import embed
        embed(["warm up"])  # loads bge-small once (or the hashed fallback)
    tasks = workers.start() if s.run_workers and db.is_open() else []
    yield
    await workers.stop(tasks)
    db.close_pool()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Formal Connection ML service", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    errors.install(app)
    for name in ROUTERS:
        module = importlib.import_module(f"app.routers.{name}")
        app.include_router(module.router)
    return app


app = create_app()
