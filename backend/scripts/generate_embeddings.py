"""
STEP 3 — Generate Embeddings
Run after generate_descriptions.py.
For each product WITHOUT embeddings:
  - Encodes the ACTUAL IMAGE with CLIP (visual_embedding)
  - Encodes the REAL visual_description + metadata with CLIP (text_embedding)
  - Combines 60% visual + 40% text (combined_embedding)
  - Inserts into product_embeddings table

Idempotent: skips products that already have embeddings.

Usage:
    cd backend
    .venv/Scripts/python scripts/generate_embeddings.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supabase import create_client
from PIL import Image
from io import BytesIO
from dotenv import load_dotenv
import os, requests, numpy as np

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
IMG_WEIGHT   = float(os.getenv("IMAGE_WEIGHT", "0.6"))
TXT_WEIGHT   = 1.0 - IMG_WEIGHT

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def download_image(image_url: str) -> Image.Image:
    """Download image from URL and return as PIL Image."""
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    return Image.open(BytesIO(response.content)).convert("RGB")


def combine_embeddings(img_emb: np.ndarray, txt_emb: np.ndarray) -> np.ndarray:
    """Combine visual + text embeddings with 60/40 weighting, L2-normalized."""
    combined = IMG_WEIGHT * img_emb + TXT_WEIGHT * txt_emb
    norm = np.linalg.norm(combined)
    if norm > 1e-8:
        combined = combined / norm
    return combined


def main():
    print("=" * 60)
    print(f"  STEP 3 — Generate CLIP Embeddings ({IMG_WEIGHT:.0%} visual / {TXT_WEIGHT:.0%} text)")
    print("=" * 60)

    # Load CLIP service
    print("\n🤖 Loading CLIP model (ViT-B-32)...")
    from app.services.clip_service import get_clip_service
    clip_svc = get_clip_service()
    clip_svc._ensure_loaded()
    print("  ✅ CLIP loaded")

    # Get products that have descriptions but no embeddings yet
    all_products = supabase.table("products").select(
        "id, title, image_url, visual_description, color, category"
    ).not_.is_("description", "null").execute().data

    existing_ids = {
        row["product_id"]
        for row in supabase.table("product_embeddings").select("product_id").execute().data
    }

    products = [p for p in all_products if p["id"] not in existing_ids]
    print(f"\nGenerating embeddings for {len(products)} products...\n")

    if not products:
        print("All products already have embeddings. Nothing to do.")
        return

    success = 0
    failed = 0

    for i, p in enumerate(products):
        try:
            print(f"[{i+1}/{len(products)}] {p['title']}")

            # Download image
            pil_image = download_image(p["image_url"])

            # Visual embedding: encode the ACTUAL IMAGE
            visual_emb = clip_svc.encode_image(pil_image)
            print(f"  Visual embedding: {visual_emb.shape} (from image)")

            # Text embedding: encode the REAL Gemini description + metadata
            # Use visual_description (truth from Gemini) not title (can be corrupted later)
            visual_text = p.get("visual_description") or p["title"]
            search_text = f"{visual_text} {p['color']} {p['category']}"
            text_emb = clip_svc.encode_text(search_text)
            print(f"  Text embedding:   {text_emb.shape} (from Gemini description)")

            # Combined embedding: 60% visual + 40% text
            combined_emb = combine_embeddings(visual_emb, text_emb)
            print(f"  Combined:         {combined_emb.shape} ({IMG_WEIGHT:.0%}/{TXT_WEIGHT:.0%})")

            # Insert into product_embeddings
            supabase.table("product_embeddings").insert({
                "product_id":         p["id"],
                "visual_embedding":   visual_emb.tolist(),
                "text_embedding":     text_emb.tolist(),
                "combined_embedding": combined_emb.tolist(),
            }).execute()

            print(f"  ✅ Embedding stored for product {p['id']}")
            success += 1

        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            failed += 1
            continue

    print(f"\n{'=' * 60}")
    print(f"  ✅ STEP 3 COMPLETE")
    print(f"  Success: {success} | Failed: {failed}")
    print(f"  Weights: {IMG_WEIGHT:.0%} visual / {TXT_WEIGHT:.0%} text")
    print(f"{'=' * 60}")
    print("  Next: run scripts/corrupt_products.py")


if __name__ == "__main__":
    main()
