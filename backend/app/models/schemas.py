"""
Pydantic schemas for API request/response models.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ============================================================
# Product Schemas
# ============================================================

class ProductBase(BaseModel):
    """Base product fields."""
    title: str
    description: Optional[str] = None
    visual_description: Optional[str] = None
    price: float
    currency: str = "৳"
    category: str
    sub_category: Optional[str] = None
    color: Optional[str] = None
    gender: Optional[str] = None
    season: Optional[str] = None
    usage_type: Optional[str] = None


class ProductResponse(ProductBase):
    """Product response with all fields."""
    id: int
    image_url: Optional[str] = None
    is_corrupted: bool = False
    original_name: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductListResponse(BaseModel):
    """Paginated product list response."""
    products: list[ProductResponse]
    total: int
    limit: int
    offset: int


class CategoryResponse(BaseModel):
    """Category with product count."""
    name: str
    description: Optional[str] = None
    product_count: int = 0
    icon: Optional[str] = None


# ============================================================
# Search Schemas
# ============================================================

class TextSearchRequest(BaseModel):
    """Text search request."""
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=20, ge=1, le=50)
    threshold: float = Field(default=0.10, ge=0.0, le=1.0)
    category: Optional[str] = None
    gender: Optional[str] = None
    color: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class SearchResultItem(BaseModel):
    """Single search result with similarity score and AI Vision Match flag."""
    id: int
    title: str
    description: Optional[str] = None
    visual_description: Optional[str] = None
    price: float
    currency: str = "৳"
    category: str
    sub_category: Optional[str] = None
    color: Optional[str] = None
    gender: Optional[str] = None
    image_url: Optional[str] = None
    is_corrupted: bool = False
    original_name: Optional[str] = None
    similarity_score: float = Field(..., description="Combined embedding similarity (0-1)")
    text_relevance_score: float = Field(
        default=0.0,
        description="How well the product's display text matches the query (0-1)"
    )
    is_ai_vision_match: bool = Field(
        default=False,
        description="True when AI matched on visual features despite low text relevance"
    )


class SearchResponse(BaseModel):
    """Search response with results and metadata."""
    query: Optional[str] = None
    search_type: str  # "text", "image", "combined"
    results: list[SearchResultItem]
    total_results: int


# ============================================================
# Agent / Chat Schemas
# ============================================================

class ChatRequest(BaseModel):
    """Chat message request."""
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str
    product_id: Optional[int] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None


class ChatProductSuggestion(BaseModel):
    """Product suggested by the chat agent."""
    id: int
    title: str
    price: float
    currency: str = "৳"
    image_url: Optional[str] = None
    category: str


class ChatResponse(BaseModel):
    """Chat agent response."""
    reply: str
    session_id: str
    suggested_products: list[ChatProductSuggestion] = []


# ============================================================
# Admin Schemas
# ============================================================

class AdminUploadResponse(BaseModel):
    """Response after admin uploads a new product."""
    product: ProductResponse
    ai_visual_description: str
    message: str = "Product uploaded and indexed successfully"


# ============================================================
# Order Schemas
# ============================================================

class OrderResponse(BaseModel):
    """Order details."""
    id: int
    order_number: str
    product_id: int
    customer_name: str
    customer_email: Optional[str] = None
    quantity: int = 1
    total_price: float
    status: str
    shipping_address: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================
# Health Schema
# ============================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    database: str
    clip_model: str
    gemini: str
    version: str = "1.0.0"
