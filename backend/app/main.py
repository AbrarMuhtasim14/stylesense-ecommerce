"""
StyleSense Backend — FastAPI Application
Multimodal AI-powered e-commerce search engine.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import get_supabase_client
from app.routes import search, products, agent, admin, health, orders, auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    settings = get_settings()

    # Verify Supabase connection on startup
    try:
        client = get_supabase_client()
        print("[Supabase] Connected successfully")
    except Exception as e:
        print(f"[Supabase] Connection failed: {e}")

    # Lazy-load CLIP model (loaded on first search request)
    print(f"[CLIP] Model ({settings.clip_model}) will load on first search request")
    print(f"[Gemini] Model: {settings.gemini_model}")
    print(f"[Config] Image weight: {settings.image_weight}")
    print(f"[API] StyleSense starting on port {settings.port}")

    yield

    # Cleanup
    print("[API] StyleSense shutting down")


app = FastAPI(
    title="StyleSense API",
    description="Multimodal AI-powered fashion e-commerce search engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",        # Next.js dev
        "http://127.0.0.1:3000",
        "https://*.vercel.app",         # Vercel deployment
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(health.router, tags=["Health"])
app.include_router(search.router, prefix="/search", tags=["Search"])
app.include_router(products.router, prefix="/products", tags=["Products"])
app.include_router(agent.router, prefix="/agent", tags=["Agent"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(orders.router, prefix="/orders", tags=["Orders"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/")
async def root():
    return {
        "name": "StyleSense API",
        "version": "1.0.0",
        "description": "Multimodal AI-powered fashion e-commerce search engine",
        "docs": "/docs",
    }
