"""
Utility helpers for the StyleSense backend.
"""

import re
from typing import Optional


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename for safe storage."""
    # Remove anything that isn't alphanumeric, dash, underscore, or dot
    sanitized = re.sub(r'[^\w\-.]', '_', filename)
    return sanitized[:100]  # Limit length


def format_price(price: float, currency: str = "৳") -> str:
    """Format a price with currency symbol."""
    return f"{currency}{price:,.2f}"


def truncate_text(text: str, max_length: int = 200) -> str:
    """Truncate text to max_length, adding ellipsis if needed."""
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."
