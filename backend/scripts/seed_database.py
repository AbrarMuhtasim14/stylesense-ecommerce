"""
STEP 1 — Seed Database
Pulls 20 diverse fashion products from HuggingFace using hyper-fast streaming metadata,
uploads images to Supabase Storage, and inserts product rows with title and category placeholders.
Step 2's job is to call Gemini to generate the real titles, categories, and descriptions.

Usage:
    cd backend
    .venv/Scripts/python scripts/seed_database.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datasets import load_dataset
from supabase import create_client
from PIL import Image
from io import BytesIO
from dotenv import load_dotenv
import os, random, requests

load_dotenv()

from scripts.utils import image_to_bytes, estimate_price

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET       = os.getenv("SUPABASE_STORAGE_BUCKET", "product-images")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# We want 100 diverse items based on the subCategory column in the dataset
TARGET_DISTRIBUTION = {
    "Topwear":     60, # Outerwear, Jackets, Sweaters, Shirts, etc.
    "Bottomwear":  10, # Jeans, Trousers
    "Shoes":       5, 
    "Dress":       10, 
    "Watches":     5, 
    "Eyewear":     5, 
    "Bags":        5, 
}

# Gender mapping: HF dataset has Boys/Girls which our DB doesn't allow
GENDER_MAP = {
    "Men":    "Men",
    "Women":  "Women",
    "Boys":   "Men",
    "Girls":  "Women",
    "Unisex": "Unisex",
}


def select_diverse_products():
    """Select diverse products balanced by subCategory in streaming mode."""
    print("📥 Loading HuggingFace dataset in streaming mode (metadata only)...")
    ds = load_dataset("ceyda/fashion-products-small", split="train", streaming=True)
    # CRITICAL optimization: remove the massive image column from HF download so streaming is instant
    ds = ds.remove_columns("image")

    selected = []
    counts = {cat: 0 for cat in TARGET_DISTRIBUTION}

    # Convert to list and shuffle/randomize to get different products each seed run
    # Since streaming, we can just iterate and skip random rows or take the first matched ones
    print("🔍 Scanning dataset for diverse subcategories...")
    for item in ds:
        subcat = item.get("subCategory")
        gender = item.get("gender")
        
        # Normalize subCategory names if needed
        if subcat == "Sandal":
            subcat = "Shoes"
        elif subcat == "Wallets":
            subcat = "Bags"

        if subcat in counts and counts[subcat] < TARGET_DISTRIBUTION[subcat]:
            # Verify we can download the image from the link
            try:
                # Test downloading to ensure link is still alive
                r = requests.get(item["link"], timeout=5)
                if r.status_code == 200:
                    item["subCategory_normalized"] = subcat
                    selected.append(item)
                    counts[subcat] += 1
                    print(f"  Matched: {subcat} | ID: {item['id']} | Gender: {gender}")
            except Exception:
                continue

        if len(selected) >= 100:
            break

    print(f"\nSuccessfully selected {len(selected)} diverse products:")
    for cat, count in counts.items():
        print(f"  {cat}: {count}")
    return selected


def upload_image(image_bytes: bytes, product_id: str) -> str:
    """Upload image to Supabase Storage and return public URL."""
    path = f"products/product_{product_id}.webp"
    supabase.storage.from_(BUCKET).upload(
        path,
        image_bytes,
        file_options={"content-type": "image/webp"},
    )
    return supabase.storage.from_(BUCKET).get_public_url(path)


def main():
    print("=" * 60)
    print("  STEP 1 — Seed Database (20 diverse products)")
    print("=" * 60)

    products = select_diverse_products()

    print(f"\n🔄 Processing {len(products)} products...\n")

    inserted = 0
    for i, item in enumerate(products):
        try:
            product_id = item["id"]
            raw_gender = item.get("gender", "Unisex")
            gender = GENDER_MAP.get(raw_gender, "Unisex")
            subcat = item["subCategory_normalized"]

            # Set visual title placeholder
            name = f"Fashion Item #{product_id}"

            print(f"[{i+1}/{len(products)}] ID: {product_id} | {subcat}")

            # Download actual image from Myntra assets URL
            print("  📥 Downloading image from Myntra CDN...")
            img_response = requests.get(item["link"], timeout=10)
            img_response.raise_for_status()
            
            pil_image = Image.open(BytesIO(img_response.content)).convert("RGB")

            # Convert to high-quality WEBP bytes
            img_bytes = image_to_bytes(pil_image, fmt="WEBP")
            
            # Upload WebP image to Supabase Storage (will overwrite if exists)
            image_url = upload_image(img_bytes, product_id)
            
            # Check if this product is already in the DB to avoid duplicates
            existing = supabase.table("products").select("id").eq("image_url", image_url).execute()
            if existing.data:
                print(f"  ⏭️ Already exists in database. Skipping.")
                continue

            print(f"  📸 Uploaded to Supabase Storage: {image_url[:70]}...")

            # Insert product row — description, title, category are placeholders
            # Step 2 generates real titles and descriptions with Gemini
            row = supabase.table("products").insert({
                "title":              name,
                "description":        None,        # Step 2 fills this
                "visual_description": None,        # Step 2 fills this
                "price":              estimate_price(subcat),
                "category":           subcat,      # Temporary placeholder
                "sub_category":       subcat,
                "color":              None,        # Step 2 fills this
                "gender":             gender,
                "season":             None,        # Step 2 fills this
                "usage_type":         None,        # Step 2 fills this
                "image_url":          image_url,
                "is_corrupted":       False,
                "original_name":      name,
            }).execute()

            print(f"  ✅ Inserted product ID: {row.data[0]['id']}")
            inserted += 1

        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            continue

    print(f"\n{'=' * 60}")
    print(f"  ✅ STEP 1 COMPLETE — {inserted} products seeded")
    print(f"{'=' * 60}")
    print("  Next: run scripts/generate_descriptions.py")


if __name__ == "__main__":
    main()
