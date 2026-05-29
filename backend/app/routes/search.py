"""
Search endpoints — text and image-based vector search.

Two-stage AI architecture for image search:
  Stage 1 — Gemini Vision (the "eyes"): Examines the uploaded photo and extracts
            a clean, noise-free description of ONLY the fashion garment, ignoring
            the person, background, lighting, and non-clothing elements.
  Stage 2 — CLIP text encoder + pgvector: Encodes the Gemini description into a
            512-d vector and searches against stored product embeddings.

This handles noisy real-world photos (Instagram screenshots, blurry phone shots,
magazine cutouts, photos with busy backgrounds) far better than raw pixel encoding.
Falls back to raw CLIP image encoding if Gemini is unavailable (quota, network, etc.).

Also implements dynamic AI Vision Match badge logic (C11 correction):
  Badge shows when visual similarity is high but text metadata relevance is low.
"""

import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from app.models.schemas import TextSearchRequest, SearchResponse, SearchResultItem
from app.services.clip_service import get_clip_service
from app.services.gemini_service import GeminiService
from app.services.search_service import SearchService
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()

# ──────────────────────────────────────────────────────────────
# Gemini prompt specifically designed for customer-uploaded photos.
# Unlike the product seeding prompt, this one explicitly instructs
# Gemini to ignore the person, background, and non-clothing elements.
# ──────────────────────────────────────────────────────────────
IMAGE_SEARCH_PROMPT = """A customer uploaded this photo to find similar products in our fashion store.
Describe ONLY the main clothing or fashion item visible in this image.

Include: exact color (and any alternative color name it could be called),
garment type, fabric texture or material appearance, neckline or cut style,
fit (slim, relaxed, oversized), and any notable design details (patterns,
logos, hardware, stitching, embellishments).

IGNORE the person wearing it, the background, lighting conditions,
and any non-clothing elements entirely.

Respond with ONLY a 2-3 sentence description of the fashion item, nothing else."""


@router.post("/text", response_model=SearchResponse)
async def search_by_text(request: TextSearchRequest):
    """
    Search products by natural language text query.
    Uses the 5-Stage AI Search Pipeline.
    """
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()

    # Run the 5-stage pipeline
    pipeline_results = await pipeline.execute_search(
        query=request.query,
        limit=request.limit,
    )

    # Compute dynamic AI Vision Match flags for the results
    clip_svc = get_clip_service()
    search_svc = SearchService()
    
    enriched_results = search_svc.compute_ai_vision_match(
        results=pipeline_results,
        query_text=request.query,
        clip_service=clip_svc,
    )

    return SearchResponse(
        query=request.query,
        search_type="text",
        results=enriched_results,
        total_results=len(enriched_results),
    )


@router.post("/image", response_model=SearchResponse)
async def search_by_image(
    image: UploadFile = File(...),
    text_constraint: Optional[str] = Form(None),
    limit: int = Form(20),
    threshold: float = Form(0.10),
):
    """
    Search products by uploaded image + optional text constraint.
    Uses the 5-Stage AI Search Pipeline.
    """
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()
    search_svc = SearchService()
    clip_svc = get_clip_service()

    # Validate file type
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    # Read image bytes
    image_bytes = await image.read()

    # Run the 5-stage pipeline
    pipeline_results = await pipeline.execute_search(
        query=text_constraint,
        image_bytes=image_bytes,
        limit=limit,
    )

    # Compute dynamic AI Vision Match flags
    query_text = text_constraint or ""
    enriched_results = search_svc.compute_ai_vision_match(
        results=pipeline_results,
        query_text=query_text,
        clip_service=clip_svc,
    )

    return SearchResponse(
        query=text_constraint or "Image Upload",
        search_type="image",
        results=enriched_results,
        total_results=len(enriched_results),
    )
