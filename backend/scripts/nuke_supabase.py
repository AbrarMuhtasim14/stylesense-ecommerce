"""
STEP 0 — Nuke Supabase
Wipes ALL data: orders, product_embeddings, products, categories tables,
and deletes ALL files from the product-images storage bucket.
Run this FIRST before re-seeding.

Usage:
    cd backend
    .venv/Scripts/python scripts/nuke_supabase.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET       = os.getenv("SUPABASE_STORAGE_BUCKET", "product-images")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    print("=" * 60)
    print("  STEP 0 — Nuke Supabase (Full Clean Slate)")
    print("=" * 60)

    # ── 1. Delete all table rows (order matters: FK constraints) ──
    print("\n🗑️  Deleting all table rows...")

    tables_in_order = ["orders", "product_embeddings", "products", "categories"]
    for table in tables_in_order:
        try:
            result = supabase.table(table).delete().neq("id", -1).execute()
            count = len(result.data) if result.data else 0
            print(f"  ✅ {table}: deleted {count} rows")
        except Exception as e:
            print(f"  ⚠️  {table}: {e}")

    # ── 2. Delete all files from storage bucket ──
    print(f"\n🗑️  Deleting all files from storage bucket '{BUCKET}'...")

    try:
        files = supabase.storage.from_(BUCKET).list("products", {"limit": 1000})
        if files:
            file_paths = [f"products/{f['name']}" for f in files]
            print(f"  Found {len(file_paths)} files to delete...")

            # Supabase delete accepts batches
            batch_size = 50
            deleted = 0
            for i in range(0, len(file_paths), batch_size):
                batch = file_paths[i:i + batch_size]
                supabase.storage.from_(BUCKET).remove(batch)
                deleted += len(batch)
                print(f"  Deleted batch: {deleted}/{len(file_paths)}")

            print(f"  ✅ Deleted {deleted} files from storage")
        else:
            print("  ✅ Storage already empty")
    except Exception as e:
        print(f"  ⚠️  Storage cleanup: {e}")

    print("\n" + "=" * 60)
    print("  ✅ NUKE COMPLETE — Supabase is clean")
    print("=" * 60)
    print("  Next: run scripts/seed_database.py")


if __name__ == "__main__":
    main()
