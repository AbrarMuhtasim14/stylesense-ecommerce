"""
Verify Setup Script — Tests connectivity to all services.
Run this after setting up .env to verify everything works.
"""

import sys
import os

# Add parent to path so we can import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


def check_supabase():
    """Test Supabase connectivity."""
    print("\n🔍 Checking Supabase connection...")
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            print("  ❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
            return False

        client = create_client(url, key)

        # Try to query — will fail if tables don't exist yet, but connection works
        try:
            result = client.table("products").select("id", count="exact").limit(1).execute()
            print(f"  ✅ Connected! Products table exists with {result.count} rows")
        except Exception as e:
            if "does not exist" in str(e).lower() or "relation" in str(e).lower():
                print("  ⚠️  Connected, but 'products' table doesn't exist yet (run schema.sql)")
            else:
                print(f"  ✅ Connected! (table check: {str(e)[:80]})")

        return True
    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False


def check_storage():
    """Test Supabase Storage access."""
    print("\n🔍 Checking Supabase Storage...")
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "product-images")

        client = create_client(url, key)
        buckets = client.storage.list_buckets()
        bucket_names = [b.name for b in buckets]

        if bucket in bucket_names:
            print(f"  ✅ Storage bucket '{bucket}' exists")
        else:
            print(f"  ⚠️  Storage bucket '{bucket}' not found. Available: {bucket_names}")
            print(f"      Create it in Supabase Dashboard → Storage → New Bucket")

        return True
    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False


def check_gemini():
    """Test Gemini API connectivity."""
    print("\n🔍 Checking Gemini API...")
    try:
        from google import genai
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            print("  ❌ GEMINI_API_KEY not set")
            return False

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Say 'StyleSense AI is ready' in exactly those words.",
        )
        print(f"  ✅ Gemini API working! Response: {response.text.strip()[:80]}")
        return True
    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False


def check_env_vars():
    """Check all required environment variables are set."""
    print("\n🔍 Checking environment variables...")
    required = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_STORAGE_BUCKET",
        "GEMINI_API_KEY",
        "ADMIN_PASSWORD",
    ]

    all_set = True
    for var in required:
        val = os.getenv(var)
        if val:
            # Mask the value for security
            masked = val[:8] + "..." if len(val) > 8 else val
            print(f"  ✅ {var} = {masked}")
        else:
            print(f"  ❌ {var} is NOT set")
            all_set = False

    return all_set


if __name__ == "__main__":
    print("=" * 60)
    print("  StyleSense — Setup Verification")
    print("=" * 60)

    results = {
        "Environment Variables": check_env_vars(),
        "Supabase Connection": check_supabase(),
        "Supabase Storage": check_storage(),
        "Gemini API": check_gemini(),
    }

    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)
    for check, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status} — {check}")

    all_passed = all(results.values())
    print(f"\n{'🎉 All checks passed!' if all_passed else '⚠️  Some checks failed. Fix the issues above.'}")
    print("=" * 60)
