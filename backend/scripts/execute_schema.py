"""
Execute SQL schema against Supabase using the direct database connection.
Uses httpx to call various Supabase endpoints.
"""
import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Read schema
schema_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "database", "schema.sql"
)

with open(schema_path, "r", encoding="utf-8") as f:
    full_sql = f.read()

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

# List of endpoints to try
endpoints = [
    ("POST", f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", {"sql_query": full_sql}),
    ("POST", f"{SUPABASE_URL}/pg/query", {"query": full_sql}),
    ("POST", f"{SUPABASE_URL}/rest/v1/rpc", {"query": full_sql}),
]

with httpx.Client(timeout=30) as client:
    for method, url, payload in endpoints:
        try:
            print(f"Trying: {method} {url}")
            r = client.post(url, headers=headers, json=payload)
            print(f"  Status: {r.status_code}")
            print(f"  Body: {r.text[:200]}")
            if r.status_code < 400:
                print("  SUCCESS!")
                sys.exit(0)
        except Exception as e:
            print(f"  Error: {e}")
        print()

print("=" * 60)
print("Could not execute SQL via API.")
print("Please run the schema manually in Supabase SQL Editor:")
print(f"  1. Go to https://supabase.com/dashboard/project/ylkxenpfmbvguaygicpy/sql/new")
print(f"  2. Paste the contents of: database/schema.sql")
print(f"  3. Click 'Run'")
print("=" * 60)
