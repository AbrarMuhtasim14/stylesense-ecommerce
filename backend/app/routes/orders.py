"""
Orders endpoint — Checkout flow with mock payment processing.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import List, Optional

from app.models.database import get_supabase_client

router = APIRouter()


class OrderItem(BaseModel):
    product_id: int
    quantity: int = 1
    size: Optional[str] = None


class CheckoutRequest(BaseModel):
    customer_name: str
    customer_email: str
    shipping_address: str
    items: List[OrderItem]


class OrderResponse(BaseModel):
    order_number: str
    status: str
    total_price: float
    message: str


@router.post("/checkout", response_model=OrderResponse)
async def create_order(request: CheckoutRequest):
    """
    Create a new order with mock payment processing.
    Inserts one order row per cart item into the orders table.
    """
    if not request.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    client = get_supabase_client()

    # Generate a unique order number
    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"

    total_price = 0.0
    order_ids = []

    for item in request.items:
        # Fetch product to get the price
        product = client.table("products").select("id, price, title").eq("id", item.product_id).single().execute()
        if not product.data:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        item_total = float(product.data["price"]) * item.quantity
        total_price += item_total

        # Insert the order row
        order_data = {
            "order_number": order_number,
            "product_id": item.product_id,
            "customer_name": request.customer_name,
            "customer_email": request.customer_email,
            "quantity": item.quantity,
            "total_price": item_total,
            "status": "processing",
            "shipping_address": request.shipping_address,
        }

        result = client.table("orders").insert(order_data).execute()
        if result.data:
            order_ids.append(result.data[0]["id"])

    return OrderResponse(
        order_number=order_number,
        status="processing",
        total_price=total_price,
        message=f"Order {order_number} placed successfully! Your items are being processed.",
    )


@router.get("/my-orders")
async def get_my_orders(email: str):
    """Get all orders for a customer by email."""
    client = get_supabase_client()
    result = client.table("orders").select("*, products(id, title, image_url, price, category)").eq("customer_email", email).order("created_at", desc=True).execute()
    return {"orders": result.data or []}
