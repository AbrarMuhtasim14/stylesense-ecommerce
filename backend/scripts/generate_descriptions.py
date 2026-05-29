"""
STEP 2 — Generate Descriptions
Run after seed_database.py.
Queries for products with description IS NULL, sends each product's ACTUAL IMAGE
to Gemini 2.5 Flash for vision analysis, and updates the row with the real
title, description, visual_description, category, color, season, and usage_type.

Idempotent: skips products that already have descriptions.

Usage:
    cd backend
    .venv/Scripts/python scripts/generate_descriptions.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supabase import create_client
from dotenv import load_dotenv
from PIL import Image
from io import BytesIO
import os, time, json, requests

load_dotenv(override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_KEY   = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Gemini client using new google-genai SDK
from google import genai
from google.genai import types

gemini_client = genai.Client(api_key=GEMINI_KEY)


def download_image(image_url: str) -> Image.Image:
    """Download image from Supabase Storage URL and return as PIL Image."""
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    return Image.open(BytesIO(response.content)).convert("RGB")


def generate_descriptions(pil_image: Image.Image, current_subcat: str, gender: str) -> dict:
    """
    Send the actual product image to Gemini 2.5 Flash for vision analysis.
    Returns a dictionary containing:
      - title
      - category (refined)
      - color
      - season
      - usage_type
      - visual_description
      - product_description
    Retries on 429 with a 60-second backoff.
    """
    prompt = f"""You are a fashion product analyst and expert copywriter.

I am showing you a real fashion product image. Its current metadata is:
- Gender: {gender}
- Sub-category: {current_subcat}

Analyze this product image in detail and return the following attributes:

1. "title": A professional, appealing, brand-free e-commerce title for the product (e.g. "Men's Black Slim-Fit Denim Jeans" or "Women's Floral Summer A-Line Dress"). Do NOT include any brand names.
2. "category": Select the single best matching category from this list:
   ['Tshirts', 'Shirts', 'Jeans', 'Casual Shoes', 'Dresses', 'Watches', 'Sunglasses', 'Bags', 'Jackets', 'Kurtas']
3. "color": The primary exact color of the item (e.g. "Black", "Mint Green", "Navy Blue", "White").
4. "season": The targeted fashion season for the item. Select from: ["Summer", "Winter", "Fall", "Spring", "All-Season"].
5. "usage_type": The appropriate usage type. Select from: ["Casual", "Formal", "Sports", "Ethnic", "Smart Casual"].
6. "visual_description": Exactly 3 sentences describing ONLY what you literally see in the image. Focus on exact color(s), clothing/accessory type, texture/material appearance, neckline/cut/style, fit (slim, relaxed, oversized), and any notable visual details (patterns, logos, hardware, stitching). Do NOT mention brand names.
7. "product_description": Exactly 4 sentences as a customer-facing product description. Be descriptive, appealing, and mention key style features, styling potential, comfort, and appeal. Do NOT include brand names.

Respond with a JSON object containing these keys exactly:
"title", "category", "color", "season", "usage_type", "visual_description", "product_description"."""

    max_retries = 3
    for attempt in range(max_retries):
        try:
            from pydantic import BaseModel

            class FullProductDetails(BaseModel):
                title: str
                category: str
                color: str
                season: str
                usage_type: str
                visual_description: str
                product_description: str

            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[prompt, pil_image],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=FullProductDetails,
                ),
            )

            data = json.loads(response.text.strip())
            
            # Basic validation to ensure fields are filled
            if (data.get("title") and data.get("category") and 
                data.get("visual_description") and data.get("product_description")):
                return data

        except Exception as e:
            error_str = str(e).lower()
            if "429" in error_str or "quota" in error_str or "rate" in error_str:
                print(f"    🚨 Quota Limit Reached! (429 RESOURCE_EXHAUSTED)")
                print(f"    RAW ERROR: {e}")
                print(f"    Please update GEMINI_API_KEY in .env and run this script again.")
                print(f"    Exiting to prevent incomplete product seeding...")
                sys.exit(1)
            else:
                print(f"    ⚠️  Gemini error (attempt {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)

    # Safety fallback
    raise RuntimeError(f"Failed to generate descriptions after {max_retries} attempts")


def main():
    print("=" * 60)
    print("  STEP 2 — Generate Descriptions (Gemini 2.5 Flash Vision)")
    print("=" * 60)

    # Get all products missing descriptions
    products = supabase.table("products").select("*").is_("description", "null").execute().data
    print(f"\nFound {len(products)} products needing descriptions.\n")

    if not products:
        print("All products already have descriptions. Nothing to do.")
        return

    success = 0
    failed = 0

    for i, p in enumerate(products):
        try:
            print(f"[{i+1}/{len(products)}] ID: {p['id']} (Placeholder: {p['title']})")
            print(f"  Gender: {p['gender']} | Temporary Subcategory: {p['sub_category']}")

            # Download the actual image from Supabase Storage
            print(f"  📥 Downloading image from Supabase Storage...")
            pil_image = download_image(p["image_url"])

            # Send to Gemini for vision analysis
            print(f"  🤖 Sending to Gemini ({GEMINI_MODEL}) for full vision analysis...")
            details = generate_descriptions(pil_image, p["sub_category"], p["gender"])

            print(f"  ✨ Generated Details:")
            print(f"    Title:    {details['title']}")
            print(f"    Category: {details['category']}")
            print(f"    Color:    {details['color']}")
            print(f"    Season:   {details['season']}")
            print(f"    Usage:    {details['usage_type']}")
            print(f"    Visual:   {details['visual_description'][:80]}...")
            print(f"    Desc:     {details['product_description'][:80]}...")

            # UPDATE the row in the products table with all the real attributes
            supabase.table("products").update({
                "title":              details["title"],
                "description":        details["product_description"],
                "visual_description": details["visual_description"],
                "category":           details["category"],
                "color":              details["color"],
                "season":             details["season"],
                "usage_type":         details["usage_type"],
                "original_name":      details["title"], # Keep track of original title before corruption
            }).eq("id", p["id"]).execute()

            print(f"  ✅ Product ID {p['id']} successfully updated with real details!")
            success += 1

            # Give a very brief sleep to avoid spamming the API (vision calls naturally take 5-15s anyway)
            time.sleep(1)

        except Exception as e:
            print(f"  ❌ FAILED: {e}")
            failed += 1
            continue

    print(f"\n{'=' * 60}")
    print(f"  ✅ STEP 2 COMPLETE")
    print(f"  Success: {success} | Failed: {failed}")
    print(f"{'=' * 60}")
    print("  Next: run scripts/generate_embeddings.py")


if __name__ == "__main__":
    main()
