"""
STEP 4 — Corrupt Products
Run after generate_embeddings.py.
Swaps title + description for 5 products across DIFFERENT categories.
Embeddings, image_url, visual_description are NEVER touched.
The vector truth stays intact. Only display text changes.

Usage:
    cd backend
    .venv/Scripts/python scripts/corrupt_products.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supabase import create_client
from dotenv import load_dotenv
import os, random

load_dotenv()

SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CORRUPT_COUNT = 5


def main():
    print("=" * 60)
    print(f"  STEP 4 — Corrupt {CORRUPT_COUNT} Products")
    print("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    products = supabase.table("products").select(
        "id, title, description, color, category"
    ).execute().data
    print(f"\nTotal products in DB: {len(products)}")

    if len(products) < CORRUPT_COUNT + 1:
        print(f"❌ Not enough products to corrupt {CORRUPT_COUNT}. Aborting.")
        return

    # Pick CORRUPT_COUNT random products to corrupt
    corrupt_targets = random.sample(products, CORRUPT_COUNT)
    corrupt_ids = {p["id"] for p in corrupt_targets}

    # Build pool of non-corrupted products for swapping
    non_targets = [p for p in products if p["id"] not in corrupt_ids]

    print(f"Corrupting {CORRUPT_COUNT} products...\n")

    for i, target in enumerate(corrupt_targets):
        # Pick a product from a DIFFERENT category to maximize confusion
        different_cat = [
            p for p in non_targets
            if p["category"] != target["category"]
        ]
        source = random.choice(different_cat if different_cat else non_targets)

        print(f"[{i+1}/{CORRUPT_COUNT}]")
        print(f"  Real product  : {target['title']} ({target['category']}, {target['color']})")
        print(f"  Fake title    : {source['title']} ({source['category']})")

        supabase.table("products").update({
            "title":        source["title"],
            "description":  source["description"],
            "is_corrupted": True,
            # visual_description is NOT changed
            # image_url is NOT changed
            # embeddings table is NOT touched
        }).eq("id", target["id"]).execute()

        print(f"  ✅ Corrupted")

    print(f"\n{'=' * 60}")
    print(f"  ✅ STEP 4 COMPLETE — {CORRUPT_COUNT} products corrupted")
    print(f"{'=' * 60}")
    print("  Their images, visual_descriptions, and embeddings are still correct.")
    print("  Only display title and description were swapped.")
    print("  Next: run scripts/verify_search.py")


if __name__ == "__main__":
    main()
