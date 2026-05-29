"""
STEP 5 — Verify Search
Run after corrupt_products.py.
Tests that corrupted products still surface when searched by their REAL visual
attributes — proving the system works before demo.

Requires the FastAPI backend to be running on port 7860.

Usage:
    cd backend
    .venv/Scripts/python scripts/verify_search.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from supabase import create_client
from dotenv import load_dotenv
import os, requests

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BACKEND_URL  = os.getenv("BACKEND_URL", "http://localhost:7860")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def search(query: str, top_k: int = 10) -> list:
    """Send a text search request to the FastAPI backend."""
    r = requests.post(
        f"{BACKEND_URL}/search/text",
        json={"query": query, "limit": top_k},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["results"]


def main():
    print("=" * 60)
    print("  STEP 5 — Verify Search (Corruption Proof)")
    print("=" * 60)

    # Get corrupted products with their original names
    corrupted = supabase.table("products").select(
        "id, title, original_name, color, category"
    ).eq("is_corrupted", True).execute().data

    print(f"\nFound {len(corrupted)} corrupted products to verify.\n")

    if not corrupted:
        print("No corrupted products found. Run corrupt_products.py first.")
        return

    passed = 0
    total = len(corrupted)

    for p in corrupted:
        # Search by the REAL attributes (not the fake title)
        real_name = p["original_name"] or ""
        real_query = f"{p['color']} {p['category']} {real_name.split()[-1] if real_name else ''}"
        real_query = real_query.strip()

        print(f"Query: '{real_query}'")
        print(f"  Current (fake) title : {p['title']}")
        print(f"  Real product         : {p['original_name']}")

        try:
            results = search(real_query)
            result_ids = [r["id"] for r in results]

            if p["id"] in result_ids:
                rank = result_ids.index(p["id"]) + 1
                score = next(r["similarity_score"] for r in results if r["id"] == p["id"])
                print(f"  ✅ FOUND at rank #{rank} with score {score:.4f}")
                passed += 1
            else:
                print(f"  ❌ NOT FOUND in top {len(results)} results")
        except Exception as e:
            print(f"  ⚠️  Search failed: {e}")

        print()

    print(f"{'=' * 60}")
    print(f"  Result: {passed}/{total} corrupted products surfaced correctly.")
    print(f"{'=' * 60}")

    if passed == total:
        print("  ✅ System working perfectly. Ready for demo.")
    elif passed > 0:
        print("  ⚠️  Partial success. Try increasing IMAGE_WEIGHT in .env (e.g. 0.7).")
    else:
        print("  ❌ Search not working. Check backend server and embeddings.")


if __name__ == "__main__":
    main()
