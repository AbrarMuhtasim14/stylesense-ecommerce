"""
Shared utilities for seeding scripts.
"""
from PIL import Image
from io import BytesIO
import re
import random


def image_to_bytes(pil_image: Image.Image, fmt: str = "WEBP", quality: int = 85) -> bytes:
    """Convert PIL image to bytes in the specified format."""
    buf = BytesIO()
    pil_image.convert("RGB").save(buf, format=fmt, quality=quality)
    return buf.getvalue()


def clean_text(text: str) -> str:
    """Remove extra whitespace and non-printable chars."""
    return re.sub(r"\s+", " ", text).strip()


def estimate_price(article_type: str) -> float:
    """Assign a realistic price in ৳ based on article type."""
    price_ranges = {
        "Shirts":       (399,  1499),
        "Tshirts":      (299,   999),
        "Sweaters":     (699,  2499),
        "Jeans":        (999,  3499),
        "Casual Shoes": (799,  2999),
        "Sports Shoes": (1499, 4999),
        "Formal Shoes": (1499, 4999),
        "Sneakers":     (1499, 4999),
        "Bags":         (499,  2999),
        "Handbags":     (799,  3999),
        "Backpacks":    (599,  2499),
        "Dresses":      (799,  3499),
        "Jackets":      (999,  4999),
        "Watches":      (799,  5999),
        "Sunglasses":   (399,  1999),
        "Kurtas":       (399,  1499),
        "Tops":         (399,  1299),
        "Shorts":       (399,   999),
        "Trousers":     (699,  2499),
        "Track Pants":  (499,  1499),
        "Sandals":      (399,  1499),
        "Flip Flops":   (199,   699),
        "Heels":        (999,  3499),
        "Belts":        (299,  1499),
        "Wallets":      (399,  1999),
        "Sarees":       (999,  4999),
        "Dupatta":      (299,   999),
        "Caps":         (199,   799),
        "Socks":        (99,    399),
        "Jewellery":    (199,  2999),
        "Scarves":      (299,   999),
        "Ties":         (299,   999),
    }
    low, high = price_ranges.get(article_type, (499, 1999))
    # Round to nearest 99 for realistic pricing
    raw = random.uniform(low, high)
    return round(raw / 100) * 100 - 1
