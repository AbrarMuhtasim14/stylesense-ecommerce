"""
Health check endpoint.
Returns status of all services: database, CLIP model, Gemini.
"""

from fastapi import APIRouter
from app.models.schemas import HealthResponse
from app.models.database import get_supabase_client
from app.services.clip_service import get_clip_service
from app.config import get_settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check health of all services."""
    settings = get_settings()

    # Check database
    db_status = "disconnected"
    try:
        client = get_supabase_client()
        result = client.table("products").select("id", count="exact").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"

    # Check CLIP model
    clip_status = "not loaded"
    try:
        clip_svc = get_clip_service()
        if clip_svc.model is not None:
            clip_status = f"loaded ({settings.clip_model})"
        else:
            clip_status = "ready (lazy load)"
    except Exception:
        clip_status = "ready (lazy load)"

    # Check Gemini
    gemini_status = "configured" if settings.gemini_api_key else "not configured"

    overall = "healthy" if db_status == "connected" and gemini_status == "configured" else "degraded"

    return HealthResponse(
        status=overall,
        database=db_status,
        clip_model=clip_status,
        gemini=gemini_status,
    )
