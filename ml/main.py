"""FastAPI entry point for the ML service.

MINIMAL SHELL written for AR1 while AL1 (Alan) is pending: /health, CORS, {"error": ...} errors, and the
GitHub connect routes. Alan: extend or replace freely; keep `app.include_router(github_router)`.

    cd ml && .venv/bin/uvicorn main:app --reload --port 8000
"""
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ml.github_routes import router as github_router

app = FastAPI(title="Formal Connection ML service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CORS_ORIGINS", "*").split(",") if o],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse({"error": "invalid request"}, status_code=422)


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(github_router)
