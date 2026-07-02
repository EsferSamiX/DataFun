from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health() -> dict:
    """Simple health check endpoint."""
    return {"status": "ok"}
