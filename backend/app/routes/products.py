"""
Product endpoints — CRUD operations and catalog browsing.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.schemas import ProductResponse, ProductListResponse, CategoryResponse
from app.models.database import get_supabase_client

router = APIRouter()


@router.get("", response_model=ProductListResponse)
async def list_products(
    category: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    color: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|price|title)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List products with filters, sorting, and pagination."""
    client = get_supabase_client()

    query = client.table("products").select("*", count="exact").eq("is_active", True)

    if category:
        query = query.ilike("category", category)
    if gender:
        query = query.ilike("gender", gender)
    if color:
        query = query.ilike("color", f"%{color}%")
    if min_price is not None:
        query = query.gte("price", min_price)
    if max_price is not None:
        query = query.lte("price", max_price)

    # Sorting
    query = query.order(sort_by, desc=(sort_order == "desc"))

    # Pagination
    query = query.range(offset, offset + limit - 1)

    result = query.execute()

    return ProductListResponse(
        products=[ProductResponse(**p) for p in result.data],
        total=result.count or len(result.data),
        limit=limit,
        offset=offset,
    )


@router.get("/categories", response_model=list[CategoryResponse])
async def get_categories():
    """Get all categories with product counts."""
    client = get_supabase_client()

    # Get distinct categories with counts
    result = client.table("products").select("category").eq("is_active", True).execute()

    # Count products per category
    category_counts: dict[str, int] = {}
    for row in result.data:
        cat = row["category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # Check if categories table has extra data
    try:
        cat_result = client.table("categories").select("*").execute()
        cat_info = {c["name"]: c for c in cat_result.data}
    except Exception:
        cat_info = {}

    categories = []
    for name, count in sorted(category_counts.items()):
        info = cat_info.get(name, {})
        categories.append(CategoryResponse(
            name=name,
            description=info.get("description"),
            product_count=count,
            icon=info.get("icon"),
        ))

    return categories


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: int):
    """Get a single product by ID."""
    client = get_supabase_client()

    result = client.table("products").select("*").eq("id", product_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Product not found")

    return ProductResponse(**result.data)


@router.get("/{product_id}/similar")
async def get_similar_products(product_id: int, limit: int = Query(8, ge=1, le=20)):
    """Find visually similar products using stored visual embeddings."""
    client = get_supabase_client()

    # Use the find_similar_products SQL function
    result = client.rpc("find_similar_products", {
        "product_id_input": product_id,
        "match_count": limit,
    }).execute()

    if not result.data:
        return {"products": [], "total": 0}

    return {
        "products": result.data,
        "total": len(result.data),
    }
