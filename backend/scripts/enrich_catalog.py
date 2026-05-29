"""
Phase 1: Catalog Enrichment & Re-Embedding
Queries all 100 products, uses Gemini Vision (with Qwen fallback) to populate:
- color_family
- color_aliases
- garment_type
- search_tags
And regenerates combined embeddings using CLIP:
combined_embedding = CLIP(image) * 0.6 + CLIP(search_tags) * 0.4

Usage:
    cd backend
    .venv/Scripts/python scripts/enrich_catalog.py
"""

import sys
import os
import asyncio
import json
import time
import io
import requests
import numpy as np
from PIL import Image
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supabase import create_client
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv(override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
gemini_client = genai.Client(api_key=GEMINI_KEY)

class CatalogEnrichment(BaseModel):
    color_family: str
    color_aliases: str
    garment_type: str
    search_tags: str

def download_image(image_url: str) -> Image.Image:
    """Download image and return as PIL Image."""
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB")

async def enrich_product(pil_image: Image.Image, title: str, category: str) -> dict:
    """Send product image to Gemini (with Qwen fallback) to extract structured search metadata."""
    prompt = f"""You are a fashion product analyst. Look at this product image and extract the following structured attributes:

1. "color_family": Select the single best matching primary color family from this list: ["black", "white", "blue", "red", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "teal", "khaki", "gold", "silver"]. It must be a single word from this list.
2. "color_aliases": A comma-separated list of synonyms and descriptive color names a shopper might type (e.g. for a mint green sweater, this might be "seafoam, mint, sage, celadon, aqua mint, pale teal, soft green"). Provide 5-8 descriptive color synonyms representing the exact shade.
3. "garment_type": The precise, specific garment type. For example, "double-breasted knee-length wool blend coat with lapel collar" or "crew neck knitted pullover sweater". Be extremely precise and structural.
4. "search_tags": 12-15 comma-separated phrases a shopper would type to search for this product (e.g. "mint green sweater, men winter knit, warm cozy pullover, seafoam knitwear, casual sweater, winter crewneck, pastel green pullover"). Do NOT use any brand names. Ensure to include colors, garment type, fit, season, occasion, texture, and neckline.

Respond with a JSON object containing these keys exactly:
"color_family", "color_aliases", "garment_type", "search_tags"."""

    # Try Gemini 2.5 Flash first
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt, pil_image],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CatalogEnrichment,
                temperature=0.0
            ),
        )
        data = json.loads(response.text.strip())
        if all(k in data for k in ["color_family", "color_aliases", "garment_type", "search_tags"]):
            return data
    except Exception as e:
        print(f"    [WARN] Gemini enrichment failed or rate-limited: {e}")
        error_str = str(e).lower()
        if "429" in error_str or "quota" in error_str or "rate" in error_str or "resource" in error_str:
            print("    [ALERT] Gemini Rate Limit / Quota error. Falling back to OpenRouter Qwen...")
        else:
            print("    Trying OpenRouter Qwen fallback...")

    # Fallback to OpenRouter (Qwen)
    try:
        from app.services.openrouter_service import get_openrouter_service
        or_svc = get_openrouter_service()
        if or_svc.api_key:
            buf = io.BytesIO()
            pil_image.save(buf, format="JPEG")
            img_bytes = buf.getvalue()
            
            response_text = await or_svc.chat_with_image(prompt, img_bytes, temperature=0.0)
            response_text = response_text.strip()
            
            # Clean up potential markdown fences
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            elif response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
                
            response_text = response_text.strip()
            data = json.loads(response_text)
            if all(k in data for k in ["color_family", "color_aliases", "garment_type", "search_tags"]):
                print("    [OK] OpenRouter fallback enrichment succeeded!")
                return data
            else:
                raise ValueError("Parsed JSON missing keys")
        else:
            raise ValueError("OpenRouter API key is not configured")
    except Exception as fallback_err:
        print(f"    [ERROR] OpenRouter fallback enrichment failed: {fallback_err}")
        raise RuntimeError(f"Both Gemini and Qwen fallback failed for product: {title}")

async def main():
    print("=" * 60)
    print("  STEP 4 - Product Catalog Enrichment & Embeddings Regeneration")
    print("=" * 60)

    # Load CLIP service
    print("\n[CLIP] Loading CLIP model (ViT-B-32) on CPU...")
    from app.services.clip_service import get_clip_service
    clip_svc = get_clip_service()
    clip_svc._ensure_loaded()
    print("  [OK] CLIP loaded")

    # Get all products
    products = supabase.table("products").select("id, title, category, image_url, color_family").execute().data
    print(f"\nFound {len(products)} products in the database.")
    
    # Optional check: skip already enriched unless forced
    overwrite = True # We want to overwrite all for consistency since this is a migration run
    
    success = 0
    failed = 0

    for i, p in enumerate(products):
        try:
            print(f"[{i+1}/{len(products)}] ID: {p['id']} | {p['title']}")
            if p.get("color_family") and not overwrite:
                print("  [SKIP] Already enriched, skipping...")
                continue

            # Download image
            print("  [DOWNLOAD] Downloading image...")
            pil_image = download_image(p["image_url"])

            # Run enrichment
            print("  [LLM] Generating metadata attributes...")
            metadata = await enrich_product(pil_image, p["title"], p["category"])
            print(f"    Color Family:  {metadata['color_family']}")
            print(f"    Color Aliases: {metadata['color_aliases']}")
            print(f"    Garment Type:  {metadata['garment_type']}")
            print(f"    Search Tags:   {metadata['search_tags'][:80]}...")

            # Update database product row
            print("  [DB] Updating product table in Supabase...")
            supabase.table("products").update({
                "color_family": metadata["color_family"].strip().lower(),
                "color_aliases": metadata["color_aliases"].strip(),
                "garment_type": metadata["garment_type"].strip(),
                "search_tags": metadata["search_tags"].strip(),
            }).eq("id", p["id"]).execute()

            # Regenerate CLIP Embeddings
            print("  [EMBED] Regenerating embeddings...")
            visual_emb = clip_svc.encode_image(pil_image)
            
            # Formula: 0.6 * CLIP(image) + 0.4 * CLIP(search_tags)
            search_text = metadata["search_tags"]
            text_emb = clip_svc.encode_text(search_text)
            
            combined_emb = 0.6 * visual_emb + 0.4 * text_emb
            norm = np.linalg.norm(combined_emb)
            if norm > 1e-8:
                combined_emb = combined_emb / norm

            # Upsert into product_embeddings table
            print("  [DB] Storing embeddings in Supabase...")
            existing_emb = supabase.table("product_embeddings").select("id").eq("product_id", p["id"]).execute().data
            if existing_emb:
                supabase.table("product_embeddings").update({
                    "visual_embedding": visual_emb.tolist(),
                    "text_embedding": text_emb.tolist(),
                    "combined_embedding": combined_emb.tolist()
                }).eq("product_id", p["id"]).execute()
            else:
                supabase.table("product_embeddings").insert({
                    "product_id": p["id"],
                    "visual_embedding": visual_emb.tolist(),
                    "text_embedding": text_emb.tolist(),
                    "combined_embedding": combined_emb.tolist()
                }).execute()

            print(f"  [OK] ID {p['id']} successfully enriched and embedded!")
            success += 1
            
            # Short sleep to respect rate limits
            await asyncio.sleep(1.0)

        except Exception as e:
            print(f"  [ERROR] FAILED for product {p['id']}: {e}")
            failed += 1
            continue

    print(f"\n{'=' * 60}")
    print("  [OK] CATALOG ENRICHMENT & EMBEDDINGS REGENERATION COMPLETE")
    print(f"  Success: {success} | Failed: {failed}")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
