"""
Supabase database client initialization.
"""

from functools import lru_cache
from supabase import create_client, Client
from app.config import get_settings


@lru_cache()
def get_supabase_client() -> Client:
    """Get cached Supabase client using service role key (full access)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache()
def get_supabase_anon_client() -> Client:
    """Get cached Supabase client using anon key (RLS-restricted)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)
