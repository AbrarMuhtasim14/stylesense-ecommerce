"""
Test Search Design — Verifies the Search Engine v2.0 5-Stage Pipeline updates.
Checks the exact test cases specified in implementation_plan.md.

Usage:
    cd backend
    .venv/Scripts/python scripts/test_search_design.py
"""

import sys
import os
import asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

load_dotenv(override=True)

async def test_seafoam_pullover():
    print("\n[TEST 1] Seafoam Pullover Search...")
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()

    # Search for seafoam pullover men
    results = await pipeline.execute_search(query="seafoam pullover men", limit=5)
    
    print(f"Results for 'seafoam pullover men':")
    for rank, r in enumerate(results, 1):
        print(f"  #{rank}: ID {r['id']} | {r['title']} | Color: {r.get('color')} | Sim: {r['similarity']:.4f} | Reason: {r.get('match_reason')}")

    # Check if the light green/mint sweater (ID 223) is at rank 1
    if results and results[0]["id"] == 223:
        print("[SUCCESS] Mint Green Sweater (ID 223) is indeed Rank #1!")
        return True
    else:
        print("[FAILURE] Mint Green Sweater (ID 223) is not Rank #1.")
        return False

async def test_negation():
    print("\n[TEST 2] Color Negation Handling ('similar but not red')...")
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()

    # Search similar but not red
    results = await pipeline.execute_search(query="similar but not red", limit=10)
    
    print(f"Results for 'similar but not red' (top 5):")
    for rank, r in enumerate(results[:5], 1):
        print(f"  #{rank}: ID {r['id']} | {r['title']} | Color: {r.get('color')} | Sim: {r['similarity']:.4f}")

    # Verify no red blazer (ID 324) or any red items are returned
    red_items = [r for r in results if (r.get("color") or "").lower() == "red"]
    
    if not red_items:
        print("[SUCCESS] All red items strictly excluded!")
        return True
    else:
        print(f"[FAILURE] Red items found in results: {red_items}")
        return False

async def test_gender_leakage():
    print("\n[TEST 3] Gender Leakage Exclusion ('something similar for women')...")
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()

    # Search with women constraint in session context
    session_context = {
        "gender": "Women",
        "shown_products": [],
        "exclude_colors": [],
        "exclude_types": []
    }
    
    results = await pipeline.execute_search(
        query="something similar for women", 
        limit=10, 
        session_context=session_context
    )

    print(f"Results for 'something similar for women':")
    men_items = []
    for rank, r in enumerate(results, 1):
        gender = r.get("gender") or "N/A"
        print(f"  #{rank}: ID {r['id']} | {r['title']} | Gender: {gender} | Sim: {r['similarity']:.4f}")
        if gender.lower() == "men":
            men_items.append(r)

    if not men_items:
        print("[SUCCESS] Gender leakage prevented! No men's items returned.")
        return True
    else:
        print(f"[FAILURE] Men's items leaked into women's search: {men_items}")
        return False

async def test_conversational_shown_exclusion():
    print("\n[TEST 4] Conversational Shown Products Exclusion...")
    from app.services.search_pipeline import SearchPipeline
    pipeline = SearchPipeline()

    # Turn 1: customer sees results and we store them in shown_products
    session_context = {
        "gender": None,
        "shown_products": [],
        "exclude_colors": [],
        "exclude_types": []
    }

    # First search
    results_1 = await pipeline.execute_search(query="knitted sweater", limit=3, session_context=session_context)
    shown_ids = [r["id"] for r in results_1]
    print(f"Turn 1 Shown products: {shown_ids}")

    # Second search (same query)
    results_2 = await pipeline.execute_search(query="knitted sweater", limit=3, session_context=session_context)
    shown_ids_2 = [r["id"] for r in results_2]
    print(f"Turn 2 Shown products: {shown_ids_2}")

    # Assert no overlap
    overlap = set(shown_ids).intersection(shown_ids_2)
    if not overlap:
        print("[SUCCESS] Conversation history excludes shown products perfectly!")
        return True
    else:
        print(f"[FAILURE] Duplicate products returned across session turns: {overlap}")
        return False

async def main():
    print("=" * 60)
    print("  VERIFYING SEARCH ENGINE v2.0 UPGRADES")
    print("=" * 60)

    t1 = await test_seafoam_pullover()
    t2 = await test_negation()
    t3 = await test_gender_leakage()
    t4 = await test_conversational_shown_exclusion()

    print("\n" + "=" * 60)
    print("  VERIFICATION SUMMARY")
    print("=" * 60)
    print(f"  Test 1 (Seafoam Pullover):       {'PASSED' if t1 else 'FAILED'}")
    print(f"  Test 2 (Color Negation):         {'PASSED' if t2 else 'FAILED'}")
    print(f"  Test 3 (Gender Leakage):         {'PASSED' if t3 else 'FAILED'}")
    print(f"  Test 4 (Conversational shown):   {'PASSED' if t4 else 'FAILED'}")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
