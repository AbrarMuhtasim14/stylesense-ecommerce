"""
Search Service — Vector search and dynamic AI Vision Match badge logic.

C11 Correction: The AI Vision Match badge is computed dynamically for ALL products:
  - Encode product's display title+description with CLIP text encoder
  - Compare this "text_relevance_score" against the "similarity_score" (from combined_embedding)
  - If similarity is high but text relevance is low, the product surfaced due to visual features
    despite misleading/poor text metadata → show the badge.
  This works for corrupted products, future admin uploads, and any catalog quality issue.
"""

import numpy as np
from typing import Optional

from app.models.database import get_supabase_client
from app.models.schemas import SearchResultItem
from app.config import get_settings


class SearchService:
    """Handles vector search operations and AI Vision Match badge computation."""

    # Thresholds for AI Vision Match badge
    SIMILARITY_THRESHOLD = 0.20      # Product must have at least this much visual similarity
    RELEVANCE_GAP_THRESHOLD = 0.12   # Gap between similarity and text relevance must exceed this

    def vector_search(
        self,
        query_embedding: np.ndarray,
        threshold: float = 0.10,
        limit: int = 20,
        category: Optional[str] = None,
        gender: Optional[str] = None,
        color: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> list[dict]:
        """
        Run vector similarity search via the match_products SQL function.
        Returns raw results from Supabase.
        """
        client = get_supabase_client()

        params = {
            "query_embedding": query_embedding.tolist(),
            "match_threshold": threshold,
            "match_count": limit,
            "filter_category": category,
            "filter_gender": gender,
            "filter_color": color,
            "filter_min_price": min_price,
            "filter_max_price": max_price,
        }

        result = client.rpc("match_products", params).execute()
        return result.data or []

    def compute_ai_vision_match(
        self,
        results: list[dict],
        query_text: str,
        clip_service,
    ) -> list[SearchResultItem]:
        """
        Compute dynamic AI Vision Match badges for search results.

        For each result:
          1. similarity_score = combined_embedding cosine similarity (from pgvector)
          2. text_relevance_score = CLIP similarity between query and product's display text
          3. is_ai_vision_match = similarity is high but text relevance is low

        This is dynamic and works for ALL products, not just corrupted ones.
        """
        if not results or not query_text:
            # No query text (e.g., image-only search) — skip badge computation
            return [
                SearchResultItem(
                    id=r["id"],
                    title=r["title"],
                    description=r.get("description"),
                    visual_description=r.get("visual_description"),
                    price=float(r["price"]),
                    currency=r.get("currency", "৳"),
                    category=r["category"],
                    sub_category=r.get("sub_category"),
                    color=r.get("color"),
                    gender=r.get("gender"),
                    image_url=r.get("image_url"),
                    is_corrupted=r.get("is_corrupted", False),
                    original_name=r.get("original_name"),
                    similarity_score=float(r["similarity"]),
                    text_relevance_score=0.0,
                    is_ai_vision_match=False,
                )
                for r in results
            ]

        # Encode the query text once
        query_embedding = clip_service.encode_text(query_text)

        # Build display text strings for all results and batch-encode
        display_texts = []
        for r in results:
            text = f"{r['title']} {r.get('description', '') or ''}"
            display_texts.append(text.strip())

        # Batch encode all display texts
        text_embeddings = clip_service.encode_texts_batch(display_texts)

        enriched = []
        for i, r in enumerate(results):
            similarity_score = float(r["similarity"])

            # Compute text relevance: CLIP cosine similarity between query and display text
            text_relevance = float(
                np.dot(query_embedding, text_embeddings[i])
                / (np.linalg.norm(query_embedding) * np.linalg.norm(text_embeddings[i]) + 1e-8)
            )

            # Dynamic AI Vision Match: high visual match + low text match = badge
            is_ai_vision_match = (
                similarity_score >= self.SIMILARITY_THRESHOLD
                and (similarity_score - text_relevance) >= self.RELEVANCE_GAP_THRESHOLD
            )

            enriched.append(SearchResultItem(
                id=r["id"],
                title=r["title"],
                description=r.get("description"),
                visual_description=r.get("visual_description"),
                price=float(r["price"]),
                currency=r.get("currency", "৳"),
                category=r["category"],
                sub_category=r.get("sub_category"),
                color=r.get("color"),
                gender=r.get("gender"),
                image_url=r.get("image_url"),
                is_corrupted=r.get("is_corrupted", False),
                original_name=r.get("original_name"),
                similarity_score=similarity_score,
                text_relevance_score=text_relevance,
                is_ai_vision_match=is_ai_vision_match,
            ))

        return enriched
