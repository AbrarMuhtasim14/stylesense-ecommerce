"""
Admin endpoints — product upload with AI processing pipeline.
"""

from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException
from typing import Optional
from app.models.schemas import AdminUploadResponse, ProductResponse
from app.models.database import get_supabase_client
from app.services.clip_service import get_clip_service
from app.services.gemini_service import GeminiService
from app.services.storage_service import StorageService
from app.config import get_settings

router = APIRouter()


def verify_admin(password: str = Header(..., alias="X-Admin-Password")):
    """Verify admin password from request header."""
    settings = get_settings()
    if password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    return True


@router.post("/upload", response_model=AdminUploadResponse)
async def upload_product(
    image: UploadFile = File(...),
    title: str = Form(...),
    price: float = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    sub_category: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    season: Optional[str] = Form(None),
    usage_type: Optional[str] = Form(None),
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """
    Upload a new product with full AI processing pipeline:
    1. Verify admin password
    2. Upload image to Supabase Storage
    3. Generate visual_description with Gemini vision
    4. Generate all 3 CLIP embeddings (visual, text, combined)
    5. Insert product + embeddings into database
    """
    settings = get_settings()

    # Verify admin
    if admin_password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    # Validate image
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    image_bytes = await image.read()

    # Step 1: Upload image to Supabase Storage
    storage_svc = StorageService()
    image_url = storage_svc.upload_image(image_bytes, image.filename or "product.jpg")

    # Step 2: Generate visual description with Gemini
    gemini_svc = GeminiService()
    try:
        visual_description = await gemini_svc.generate_visual_description(image_bytes)
        if not description:
            description = await gemini_svc.generate_product_description(image_bytes)
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            raise HTTPException(
                status_code=429,
                detail="Gemini API Quota Exceeded (429): Your daily limit of 20 requests was exceeded. Please try again later or configure a paid plan."
            )
        raise HTTPException(
            status_code=500,
            detail=f"Gemini AI Service Error: {error_msg}"
        )

    # Step 3: Generate metadata enrichment using Gemini vision (with Qwen fallback)
    metadata = await gemini_svc.enrich_product_metadata(image_bytes)

    # Step 4: Generate CLIP embeddings using Search v2.0 design (0.6 * image + 0.4 * search_tags, normalized)
    import numpy as np
    clip_svc = get_clip_service()
    visual_embedding = clip_svc.encode_image(image_bytes)
    text_embedding = clip_svc.encode_text(metadata["search_tags"])
    combined_embedding = 0.6 * visual_embedding + 0.4 * text_embedding
    norm = np.linalg.norm(combined_embedding)
    if norm > 1e-8:
        combined_embedding = combined_embedding / norm

    # Step 5: Insert product into database including the 4 new search metadata columns
    client = get_supabase_client()

    product_data = {
        "title": title,
        "description": description,
        "visual_description": visual_description,
        "price": price,
        "category": category,
        "sub_category": sub_category,
        "color": color,
        "gender": gender,
        "season": season,
        "usage_type": usage_type,
        "image_url": image_url,
        "color_family": metadata["color_family"].strip().lower(),
        "color_aliases": metadata["color_aliases"].strip(),
        "garment_type": metadata["garment_type"].strip(),
        "search_tags": metadata["search_tags"].strip(),
    }

    product_result = client.table("products").insert(product_data).execute()
    product = product_result.data[0]

    # Step 6: Insert embeddings
    embedding_data = {
        "product_id": product["id"],
        "visual_embedding": visual_embedding.tolist(),
        "text_embedding": text_embedding.tolist(),
        "combined_embedding": combined_embedding.tolist(),
    }

    client.table("product_embeddings").insert(embedding_data).execute()

    return AdminUploadResponse(
        product=ProductResponse(**product),
        ai_visual_description=visual_description,
    )


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """
    Delete a product from the database.
    Cascades to delete its embeddings automatically.
    """
    settings = get_settings()
    if admin_password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    client = get_supabase_client()
    
    # Check if exists
    existing = client.table("products").select("id").eq("id", product_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Product not found")

    # Delete product
    client.table("products").delete().eq("id", product_id).execute()
    return {"message": "Product deleted successfully", "id": product_id}


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    image: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    category: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    visual_description: Optional[str] = Form(None),
    sub_category: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    season: Optional[str] = Form(None),
    usage_type: Optional[str] = Form(None),
    regenerate_description: Optional[bool] = Form(None),
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """
    Update an existing product's metadata and optionally its image.
    If image or visual-affecting metadata changes, CLIP embeddings are updated.
    """
    import numpy as np
    import requests

    settings = get_settings()
    if admin_password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    client = get_supabase_client()

    # Get existing product
    existing_res = client.table("products").select("*").eq("id", product_id).single().execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Product not found")
    existing_product = existing_res.data

    updates = {}
    if title is not None: updates["title"] = title
    if price is not None: updates["price"] = price
    if category is not None: updates["category"] = category
    if description is not None: updates["description"] = description
    if visual_description is not None: updates["visual_description"] = visual_description
    if sub_category is not None: updates["sub_category"] = sub_category
    if color is not None: updates["color"] = color
    if gender is not None: updates["gender"] = gender
    if season is not None: updates["season"] = season
    if usage_type is not None: updates["usage_type"] = usage_type

    image_uploaded = False
    visual_embedding = None
    
    # Handle image replacement
    if image is not None:
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Uploaded file must be an image")
        
        image_bytes = await image.read()
        storage_svc = StorageService()
        image_url = storage_svc.upload_image(image_bytes, image.filename or "product.jpg")
        updates["image_url"] = image_url
        image_uploaded = True
        
        # If user didn't explicitly override the description, generate a new one with Gemini
        if visual_description is None:
            gemini_svc = GeminiService()
            try:
                new_visual_desc = await gemini_svc.generate_visual_description(image_bytes)
                updates["visual_description"] = new_visual_desc
                if not description and "description" not in updates:
                    new_product_desc = await gemini_svc.generate_product_description(image_bytes)
                    updates["description"] = new_product_desc
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                    raise HTTPException(
                        status_code=429,
                        detail="Gemini API Quota Exceeded (429) during image replace description generation."
                    )
                raise HTTPException(
                    status_code=500,
                    detail=f"Gemini AI Service Error: {error_msg}"
                )
        
        # Generate new search metadata
        try:
            gemini_svc = GeminiService()
            metadata = await gemini_svc.enrich_product_metadata(image_bytes)
            updates["color_family"] = metadata["color_family"].strip().lower()
            updates["color_aliases"] = metadata["color_aliases"].strip()
            updates["garment_type"] = metadata["garment_type"].strip()
            updates["search_tags"] = metadata["search_tags"].strip()
        except Exception as e:
            # Let it propagate or log
            pass
        
        # Encode new image bytes with CLIP visual encoder
        clip_svc = get_clip_service()
        visual_embedding = clip_svc.encode_image(image_bytes)

    elif regenerate_description:
        gemini_svc = GeminiService()
        try:
            # Download current product image
            resp = requests.get(existing_product["image_url"], timeout=30)
            resp.raise_for_status()
            image_bytes = resp.content
            
            new_visual_desc = await gemini_svc.generate_visual_description(image_bytes)
            updates["visual_description"] = new_visual_desc
            if not description and "description" not in updates:
                new_product_desc = await gemini_svc.generate_product_description(image_bytes)
                updates["description"] = new_product_desc
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                raise HTTPException(
                    status_code=429,
                    detail="Gemini API Quota Exceeded (429) during description regeneration."
                )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to regenerate description from existing image: {error_msg}"
            )

    # Determine if we should update embeddings
    text_fields_changed = any(
        k in updates for k in ["title", "color", "category", "visual_description"]
    )
    
    if image_uploaded or regenerate_description or text_fields_changed:
        # Get latest text values (search_tags)
        final_tags = updates.get("search_tags") or existing_product.get("search_tags") or ""
        
        if not final_tags:
            # Fallback compile if metadata not yet generated
            final_desc = updates.get("visual_description") or existing_product.get("visual_description") or ""
            final_color = updates.get("color") if "color" in updates else existing_product.get("color") or ""
            final_category = updates.get("category") if "category" in updates else existing_product.get("category") or ""
            final_tags = f"{final_desc} {final_color} {final_category}"
            
        clip_svc = get_clip_service()
        
        # Encode new text vector
        text_embedding = clip_svc.encode_text(final_tags)
        
        # Get latest visual vector
        if visual_embedding is None:
            # Load existing visual embedding from DB
            emb_res = client.table("product_embeddings").select("visual_embedding").eq("product_id", product_id).single().execute()
            if emb_res.data and "visual_embedding" in emb_res.data:
                visual_embedding = np.array(emb_res.data["visual_embedding"])
            else:
                # If visual embedding is somehow missing, fall back to encoding existing image
                resp = requests.get(existing_product["image_url"], timeout=30)
                resp.raise_for_status()
                visual_embedding = clip_svc.encode_image(resp.content)
        
        # Combine embeddings using 0.6 / 0.4 normalized
        combined_embedding = 0.6 * visual_embedding + 0.4 * text_embedding
        norm = np.linalg.norm(combined_embedding)
        if norm > 1e-8:
            combined_embedding = combined_embedding / norm
        
        # Update product_embeddings
        emb_update = {
            "text_embedding": text_embedding.tolist(),
            "combined_embedding": combined_embedding.tolist(),
        }
        if image_uploaded:
            emb_update["visual_embedding"] = visual_embedding.tolist()
            
        client.table("product_embeddings").update(emb_update).eq("product_id", product_id).execute()

    # Update products table
    if updates:
        client.table("products").update(updates).eq("id", product_id).execute()

    # Return updated product
    updated_product = client.table("products").select("*").eq("id", product_id).single().execute()
    return ProductResponse(**updated_product.data)


# ============================================================
# Admin Ticket Management
# ============================================================

from app.services.ticket_workflow import get_ticket_service
from pydantic import BaseModel

class TicketActionRequest(BaseModel):
    action: str  # "APPROVE", "REJECT", or "ESCALATE"
    resolution_notes: str = ""

@router.get("/tickets")
async def get_tickets(
    status: Optional[str] = None,
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """Get tickets, optionally filtered by status."""
    verify_admin(admin_password)
    client = get_supabase_client()
    query = client.table("tickets").select("*, orders(order_number, total_price)").order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    
    result = query.execute()
    return {"tickets": result.data}


@router.patch("/tickets/{ticket_id}")
async def update_ticket_status(
    ticket_id: int,
    request: TicketActionRequest,
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """Approve or reject a ticket."""
    verify_admin(admin_password)
    
    ticket_svc = get_ticket_service()
    ticket = ticket_svc.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    if request.action == "APPROVE":
        updated = ticket_svc.update_status(ticket_id, "APPROVED", request.resolution_notes)
        # If it's a cancellation, we should also cancel the order
        if ticket["type"] == "cancellation":
            client = get_supabase_client()
            client.table("orders").update({"status": "cancelled"}).eq("id", ticket["order_id"]).execute()
    elif request.action == "REJECT":
        updated = ticket_svc.update_status(ticket_id, "REJECTED", request.resolution_notes)
    elif request.action == "ESCALATE":
        updated = ticket_svc.update_status(ticket_id, "UNDER_REVIEW", request.resolution_notes)
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    return updated


# ============================================================
# Admin Order Management
# ============================================================

class OrderStatusUpdateRequest(BaseModel):
    status: str

@router.get("/orders")
async def get_admin_orders(
    status: Optional[str] = None,
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """Get all customer orders, optionally filtered by status."""
    verify_admin(admin_password)
    client = get_supabase_client()
    query = client.table("orders").select("*, products(id, title, image_url, price, category)").order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    
    result = query.execute()
    return {"orders": result.data or []}


@router.patch("/orders/{order_number}")
async def update_order_status(
    order_number: str,
    request: OrderStatusUpdateRequest,
    admin_password: str = Header(..., alias="X-Admin-Password"),
):
    """Update status of all order items matching an order number."""
    verify_admin(admin_password)
    
    if request.status not in ["processing", "shipped", "delivered", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid order status")
        
    client = get_supabase_client()
    result = client.table("orders").update({"status": request.status}).eq("order_number", order_number).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Order not found")
        
    return {"message": f"Order {order_number} status updated to {request.status}", "orders": result.data}


