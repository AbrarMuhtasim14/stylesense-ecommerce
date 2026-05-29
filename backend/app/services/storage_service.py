"""
Storage Service — Supabase Storage for product images.
"""

import uuid
from pathlib import Path

from app.models.database import get_supabase_client
from app.config import get_settings


class StorageService:
    """Handles image upload/retrieval to/from Supabase Storage."""

    def __init__(self):
        self.settings = get_settings()
        self.client = get_supabase_client()
        self.bucket = self.settings.supabase_storage_bucket

    def upload_image(self, image_bytes: bytes, original_filename: str) -> str:
        """
        Upload an image to Supabase Storage and return the public URL.
        Generates a unique filename to prevent collisions.
        """
        # Generate unique filename
        ext = Path(original_filename).suffix or ".jpg"
        unique_name = f"products/{uuid.uuid4().hex}{ext}"

        # Determine content type
        content_type_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        content_type = content_type_map.get(ext.lower(), "image/jpeg")

        # Upload to Supabase Storage
        self.client.storage.from_(self.bucket).upload(
            path=unique_name,
            file=image_bytes,
            file_options={"content-type": content_type},
        )

        # Get public URL
        public_url = self.client.storage.from_(self.bucket).get_public_url(unique_name)

        return public_url

    def delete_image(self, image_url: str) -> bool:
        """Delete an image from Supabase Storage by its URL."""
        try:
            # Extract path from URL
            bucket_path = image_url.split(f"/{self.bucket}/")[-1]
            self.client.storage.from_(self.bucket).remove([bucket_path])
            return True
        except Exception:
            return False
