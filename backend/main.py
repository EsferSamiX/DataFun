"""
DataFun Backend — FastAPI application entry point.

Starts on port 8000. Registers all routers and configures:
  - CORS for localhost:3000 (Next.js frontend)
  - DB initialization via lifespan
  - Global exception handling
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.postgres import init_db
from routers import auth, health, history, pipeline, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database on startup."""
    await init_db()
    yield


app = FastAPI(
    title="DataFun API",
    description="AI-powered data profiling and model suggestion backend.",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(history.router)
app.include_router(profile.router)
app.include_router(pipeline.router)
app.include_router(health.router)
