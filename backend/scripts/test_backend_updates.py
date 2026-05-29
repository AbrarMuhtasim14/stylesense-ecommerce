"""
Test Backend Updates.
Runs test cases to verify auth endpoints, search pipeline gender filtering, and agent order cancellation updates.
"""

import os
import sys
import asyncio
from dotenv import load_dotenv

# Add backend directory to python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
load_dotenv()

from fastapi.testclient import TestClient
from app.main import app
from app.services.search_pipeline import SearchPipeline
from app.services.agent_service import AgentService
from app.models.database import get_supabase_client

client = TestClient(app)

def test_auth_endpoints():
    print("\n--- Testing Auth Endpoints ---")
    
    # Test Signup
    test_email = "test_user_unique_123@example.com"
    test_name = "Auth Test User"
    
    # Pre-clean just in case
    db = get_supabase_client()
    db.table("profiles").delete().eq("email", test_email).execute()
    
    signup_data = {"email": test_email, "name": test_name}
    r = client.post("/auth/signup", json=signup_data)
    print(f"Signup response status: {r.status_code}")
    print(f"Signup response body: {r.json()}")
    assert r.status_code == 201
    assert r.json()["email"] == test_email
    assert r.json()["name"] == test_name
    
    # Test Duplicate Signup
    r_dup = client.post("/auth/signup", json=signup_data)
    print(f"Duplicate signup response status: {r_dup.status_code}")
    assert r_dup.status_code == 400
    
    # Test Login
    login_data = {"email": test_email}
    r_login = client.post("/auth/login", json=login_data)
    print(f"Login response status: {r_login.status_code}")
    print(f"Login response body: {r_login.json()}")
    assert r_login.status_code == 200
    assert r_login.json()["email"] == test_email
    assert r_login.json()["name"] == test_name
    
    # Test Login with Non-existent Email
    r_bad_login = client.post("/auth/login", json={"email": "nonexistent@example.com"})
    print(f"Bad login response status: {r_bad_login.status_code}")
    assert r_bad_login.status_code == 404
    
    # Cleanup
    db.table("profiles").delete().eq("email", test_email).execute()
    print("[PASS] Auth endpoints test passed!")

async def test_search_pipeline():
    print("\n--- Testing Search Pipeline Gender Enforcements ---")
    pipeline = SearchPipeline()
    
    # Test fallback regex mapping: 'Boys' -> 'Men'
    regex_boys = pipeline._regex_extract_attributes("boys sportswear shirt")
    print(f"Regex extract 'boys sportswear shirt': {regex_boys}")
    assert regex_boys.get("gender") == "Men"
    
    # Test fallback regex mapping: 'Girls' -> 'Women'
    regex_girls = pipeline._regex_extract_attributes("girls casual shoes")
    print(f"Regex extract 'girls casual shoes': {regex_girls}")
    assert regex_girls.get("gender") == "Women"
    
    # Test _extract_attributes mapping via fallback/regex or direct
    extracted_boys = await pipeline._extract_attributes("boys shirt")
    print(f"Extracted attributes for 'boys shirt': {extracted_boys}")
    assert extracted_boys.get("gender") == "Men"
    
    # Test passes_hard_filters logic under strict gender constraints
    # Setup test items
    men_item = {"id": 1, "gender": "Men", "category": "Topwear", "color": "Blue", "similarity": 0.8}
    women_item = {"id": 2, "gender": "Women", "category": "Topwear", "color": "Blue", "similarity": 0.8}
    unisex_item = {"id": 3, "gender": "Unisex", "category": "Topwear", "color": "Blue", "similarity": 0.8}
    
    # Setup a helper to simulate fusion filtering
    def run_filter(item, attrs):
        res = pipeline._fuse_results([item], [], attrs)
        return item["id"] in res

    # 1. Query has gender = 'Men'
    attrs_men = {"gender": "Men"}
    print(f"Filtering with {attrs_men}:")
    print(f"  Men's product passes? {run_filter(men_item, attrs_men)}")
    print(f"  Women's product passes? {run_filter(women_item, attrs_men)}")
    print(f"  Unisex product passes? {run_filter(unisex_item, attrs_men)}")
    assert run_filter(men_item, attrs_men) is True
    assert run_filter(women_item, attrs_men) is False
    assert run_filter(unisex_item, attrs_men) is True
    
    # 2. Query has gender = 'Women'
    attrs_women = {"gender": "Women"}
    print(f"Filtering with {attrs_women}:")
    print(f"  Men's product passes? {run_filter(men_item, attrs_women)}")
    print(f"  Women's product passes? {run_filter(women_item, attrs_women)}")
    print(f"  Unisex product passes? {run_filter(unisex_item, attrs_women)}")
    assert run_filter(men_item, attrs_women) is False
    assert run_filter(women_item, attrs_women) is True
    assert run_filter(unisex_item, attrs_women) is True

    # 3. Category/Color equality constraints should be ignored
    attrs_relaxed = {"category": "Bottomwear", "color": "Red", "gender": "Men"}
    print(f"Filtering with relaxed category/color {attrs_relaxed}:")
    # Category is Bottomwear, color is Red, but item is Topwear Blue Men
    # Since category/color constraints are removed, it should still pass gender-wise
    print(f"  Men's Blue Topwear passes? {run_filter(men_item, attrs_relaxed)}")
    assert run_filter(men_item, attrs_relaxed) is True

    print("[PASS] Search Pipeline tests passed!")

async def test_agent_cancel_order():
    print("\n--- Testing Agent Service Cancel Order ---")
    agent = AgentService()
    db = get_supabase_client()
    
    # Setup test order items
    test_ord_number = "ORD-TEST-UPDATE-999"
    test_email = "test_cancel@example.com"
    
    # Fetch a valid product ID to associate with the order items
    prod = db.table("products").select("id").limit(1).execute().data
    if not prod:
        print("Skipping cancel order test (no products in db).")
        return
    prod_id = prod[0]["id"]
    
    # Cleanup pre-existing
    test_orders = db.table("orders").select("id").eq("order_number", test_ord_number).execute().data
    if test_orders:
        order_ids = [o["id"] for o in test_orders]
        db.table("tickets").delete().in_("order_id", order_ids).execute()
        db.table("orders").delete().eq("order_number", test_ord_number).execute()
        
    # Insert multiple items under same order number
    db.table("orders").insert([
        {
            "order_number": test_ord_number,
            "product_id": prod_id,
            "customer_name": "Test Customer",
            "customer_email": test_email,
            "quantity": 1,
            "total_price": 1500.0,
            "status": "processing"
        },
        {
            "order_number": test_ord_number,
            "product_id": prod_id,
            "customer_name": "Test Customer",
            "customer_email": test_email,
            "quantity": 2,
            "total_price": 3000.0,
            "status": "processing"
        }
    ]).execute()
    
    # Call _tool_cancel_order
    res_msg, _ = await agent._tool_cancel_order(test_ord_number, test_email)
    print(f"Cancel order tool response message: {res_msg}")
    assert "cancelled successfully" in res_msg
    assert "All items" in res_msg or "entire order" in res_msg
    
    # Verify both items in database are now 'cancelled'
    updated_orders = db.table("orders").select("status").eq("order_number", test_ord_number).execute().data
    print(f"Updated order statuses: {updated_orders}")
    for o in updated_orders:
        assert o["status"] == "cancelled"
        
    # Clean up
    test_orders = db.table("orders").select("id").eq("order_number", test_ord_number).execute().data
    if test_orders:
        order_ids = [o["id"] for o in test_orders]
        db.table("tickets").delete().in_("order_id", order_ids).execute()
        db.table("orders").delete().eq("order_number", test_ord_number).execute()
        
    print("[PASS] Agent Cancel Order test passed!")

async def main():
    test_auth_endpoints()
    await test_search_pipeline()
    await test_agent_cancel_order()
    print("\nALL TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
