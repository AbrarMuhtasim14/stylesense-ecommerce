"""Verify all database tables and functions exist."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

print("Checking tables...")
tables = ["products", "product_embeddings", "orders", "categories"]
for table in tables:
    try:
        r = client.table(table).select("id", count="exact").limit(1).execute()
        print(f"  {table}: exists ({r.count} rows)")
    except Exception as e:
        print(f"  {table}: ERROR - {str(e)[:80]}")

print("\nChecking functions...")
import numpy as np
# Test match_products with a dummy vector
dummy_vec = np.random.randn(512).tolist()
try:
    r = client.rpc("match_products", {"query_embedding": dummy_vec, "match_count": 1}).execute()
    print(f"  match_products: works (returned {len(r.data)} results)")
except Exception as e:
    print(f"  match_products: ERROR - {str(e)[:80]}")

try:
    r = client.rpc("find_similar_products", {"product_id_input": 1, "match_count": 1}).execute()
    print(f"  find_similar_products: works (returned {len(r.data)} results)")
except Exception as e:
    print(f"  find_similar_products: ERROR - {str(e)[:80]}")

print("\nDone!")
