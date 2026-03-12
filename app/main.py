"""Feed Engine FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import health, feeds

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure DB schema exists
    try:
        from app.database import engine
        from app.models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"DB init warning: {e}")

    # Register with main platform
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{settings.platform_url}/api/v1/modules/register",
                json={"url": f"http://feed-engine:{settings.module_port}"},
                headers={"X-Module-Key": settings.module_api_key},
            )
    except Exception:
        pass  # Non-fatal — platform may not be ready yet, will retry

    yield

    print("Feed Engine shutting down")


app = FastAPI(
    title="IntelWatch — Feed Engine",
    description="Threat intelligence feed ingestion, normalization, and scoring module",
    version=settings.module_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restricted to internal Docker network
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(feeds.router)


@app.get("/")
async def root():
    return {
        "module": "feed-engine",
        "version": settings.module_version,
        "status": "running",
        "docs": "/docs",
    }
