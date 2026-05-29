"""
Chat agent endpoint — Gemini-powered conversational shopping assistant.
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse
from app.services.agent_service import AgentService

router = APIRouter()

agent_service = AgentService()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Conversational shopping assistant.
    Handles: product search, style advice, size guidance,
    order status queries, return/cancellation requests.
    """
    try:
        reply, suggested_products = await agent_service.process_message(
            message=request.message,
            session_id=request.session_id,
            product_id=request.product_id,
            customer_email=request.customer_email,
            customer_name=request.customer_name,
        )

        return ChatResponse(
            reply=reply,
            session_id=request.session_id,
            suggested_products=suggested_products,
        )
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            reply = "I'm currently experiencing high demand. Please try again in a minute! 😊"
        else:
            reply = "I'm sorry, something went wrong on my end. Please try again."
        return ChatResponse(
            reply=reply,
            session_id=request.session_id,
            suggested_products=[],
        )

from fastapi import UploadFile, File
from app.services.storage_service import StorageService

@router.post("/upload_evidence")
async def upload_evidence(image: UploadFile = File(...)):
    """Upload an evidence image for a return or dispute."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    image_bytes = await image.read()
    storage_svc = StorageService()
    
    # Prefix with evidence/ to keep storage organized if needed, or just let storage_svc handle it
    image_url = storage_svc.upload_image(image_bytes, f"evidence_{image.filename}")
    
    return {"evidence_url": image_url}
