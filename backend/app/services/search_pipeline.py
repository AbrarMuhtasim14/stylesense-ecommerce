"""
Search Pipeline — 5-Stage AI Search Engine.
Stage 1: Intent & Attribute Extraction using Gemini (with Qwen fallback).
Stage 2: Dual Path Search (Semantic Path + SQL Filter Path) and 20% Fusion Boost.
Stage 3: Hard Exclusions (Gender, Budget, Color Negations, Structural Rules, and Session Shown Products).
Stage 4: Boost Reranking (+0.25 Color, +0.20 Category, +0.10 Season, +0.08 Fit/Texture, +0.05 Usage).
Stage 5: Return Top 10 with Similarity and Match Reason Metadata.
"""

import json
import logging
import asyncio
import numpy as np
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from google import genai
from google.genai import types

from app.services.gemini_service import GeminiService
from app.services.clip_service import get_clip_service
from app.services.search_service import SearchService
from app.models.database import get_supabase_client
from app.config import get_settings

logger = logging.getLogger(__name__)


class SearchQueryUnderstandingSchema(BaseModel):
    category: Optional[str] = None
    garment_type: Optional[str] = None
    color_family: Optional[str] = None
    color_aliases: Optional[str] = None
    gender: Optional[str] = None
    season: Optional[str] = None
    fit: Optional[str] = None
    texture: Optional[str] = None
    usage_type: Optional[str] = None
    price_max: Optional[float] = None
    exclude_colors: Optional[str] = None
    exclude_fits: Optional[str] = None
    exclude_types: Optional[str] = None
    enriched_query: str


class SearchPipeline:
    def __init__(self):
        self.gemini_svc = GeminiService()
        self.clip_svc = get_clip_service()
        self.search_svc = SearchService()
        self.client = get_supabase_client()

    async def execute_search(
        self,
        query: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        limit: int = 10,
        session_context: Optional[dict] = None
    ) -> List[Dict[str, Any]]:
        """Executes the full 5-stage search pipeline with optional session context accumulation."""
        
        # ---------------------------------------------------------
        # Stage 1: Intent & Attribute Extraction
        # ---------------------------------------------------------
        attributes = await self._extract_attributes(query, image_bytes)
        logger.info(f"Stage 1 Unified Extraction: {attributes}")

        # Accumulate shopping constraints across session turns if session_context is provided
        if session_context is not None:
            # Single-value overrides
            for key in ["gender", "category", "price_max", "color_family", "color_aliases", "season", "fit", "texture", "usage_type"]:
                val = attributes.get(key)
                if val:
                    session_context[key] = val
            
            # List accumulations for exclusions
            new_exclude_colors_str = attributes.get("exclude_colors") or ""
            new_exclude_colors = [c.strip().lower() for c in new_exclude_colors_str.split(",") if c.strip()]
            for c in new_exclude_colors:
                if c not in session_context.get("exclude_colors", []):
                    session_context.setdefault("exclude_colors", []).append(c)

            new_exclude_types_str = attributes.get("exclude_types") or ""
            new_exclude_types = [t.strip().lower() for t in new_exclude_types_str.split(",") if t.strip()]
            for t in new_exclude_types:
                if t not in session_context.get("exclude_types", []):
                    session_context.setdefault("exclude_types", []).append(t)

            # Use accumulated constraints as active parameters
            active_attrs = {k: v for k, v in session_context.items() if v is not None and k not in ["shown_products", "exclude_colors", "exclude_types"]}
            active_attrs["exclude_colors"] = ",".join(session_context.get("exclude_colors", []))
            active_attrs["exclude_types"] = ",".join(session_context.get("exclude_types", []))
            
            # Enrich search query using accumulated positive terms
            positive_terms = [attributes.get("enriched_query") or ""]
            for k in ["category", "color_family", "season", "fit", "texture", "usage_type"]:
                val = session_context.get(k)
                if val and val.lower() not in (attributes.get("enriched_query") or "").lower():
                    positive_terms.append(val)
            active_attrs["enriched_query"] = " ".join([t for t in positive_terms if t]).strip()
        else:
            active_attrs = attributes

        # ---------------------------------------------------------
        # Stage 2: Dual Path Search
        # ---------------------------------------------------------
        # A. Semantic Search Path (via CLIP embeddings)
        enriched_query = active_attrs.get("enriched_query") or query or ""
        
        # Generate CLIP Text vector
        text_vector = None
        if enriched_query:
            text_vector = self.clip_svc.encode_text(enriched_query)

        # Generate CLIP Image vector if image uploaded
        image_vector = None
        if image_bytes:
            image_vector = self.clip_svc.encode_image(image_bytes)

        # Combine image (50%) and text (50%) vectors if both exist
        if image_vector is not None and text_vector is not None:
            query_vector = 0.5 * image_vector + 0.5 * text_vector
            norm = np.linalg.norm(query_vector)
            if norm > 1e-8:
                query_vector = query_vector / norm
        elif image_vector is not None:
            query_vector = image_vector
        elif text_vector is not None:
            query_vector = text_vector
        else:
            logger.warning("No search input provided for embedding.")
            return []

        # Fetch active products and their combined embeddings from DB
        products_res = self.client.table("products").select("*").eq("is_active", True).execute()
        products = products_res.data or []

        embeddings_res = self.client.table("product_embeddings").select("product_id, combined_embedding").execute()
        embeddings = {e["product_id"]: e["combined_embedding"] for e in (embeddings_res.data or [])}

        # Calculate cosine similarity scores for all products (Path A)
        candidates = []
        for p in products:
            p_id = p["id"]
            p_emb = embeddings.get(p_id)
            if p_emb is not None:
                if isinstance(p_emb, str):
                    p_emb = json.loads(p_emb)
                p_emb_arr = np.array(p_emb, dtype=float)
                sim = float(np.dot(query_vector, p_emb_arr) / (np.linalg.norm(query_vector) * np.linalg.norm(p_emb_arr) + 1e-8))
            else:
                sim = 0.0

            # Match criteria for SQL attribute path (Path B)
            is_in_path_b = True
            
            # Check gender filter (Men/Women/Unisex)
            req_gender = active_attrs.get("gender")
            if req_gender:
                item_gender = (p.get("gender") or "").lower()
                req_gender_lower = req_gender.lower()
                if req_gender_lower == "boys":
                    req_gender_lower = "men"
                elif req_gender_lower == "girls":
                    req_gender_lower = "women"
                
                if req_gender_lower == "men":
                    if item_gender not in ["men", "unisex"]:
                        is_in_path_b = False
                elif req_gender_lower == "women":
                    if item_gender not in ["women", "unisex"]:
                        is_in_path_b = False
                else:
                    if item_gender != req_gender_lower:
                        is_in_path_b = False

            # Check category filter
            req_category = active_attrs.get("category")
            if req_category and (p.get("category") or "").lower() != req_category.lower():
                is_in_path_b = False

            # Check price filter
            req_price_max = active_attrs.get("price_max")
            if req_price_max and float(p.get("price") or 0) > float(req_price_max):
                is_in_path_b = False

            # Check color family/aliases filters
            req_color = active_attrs.get("color_family")
            if req_color:
                p_color_family = (p.get("color_family") or "").lower()
                p_color_aliases = (p.get("color_aliases") or "").lower()
                p_color = (p.get("color") or "").lower()
                req_color_lower = req_color.lower()
                
                if (req_color_lower != p_color_family and 
                    req_color_lower not in p_color_aliases and 
                    req_color_lower not in p_color):
                    is_in_path_b = False

            # Check season filter
            req_season = active_attrs.get("season")
            if req_season and (p.get("season") or "").lower() != req_season.lower():
                is_in_path_b = False

            # Ensure Path B actually matched something to prevent empty boosts
            has_any_path_b_criteria = any([req_gender, req_category, req_price_max, req_color, req_season])
            is_in_path_b = is_in_path_b and has_any_path_b_criteria

            # Dual Path Fusion score calculation
            # Products in both Path A and Path B get a 20% fusion boost
            fusion_boosted = False
            if is_in_path_b and sim > 0.0:
                fusion_score = sim * 1.20
                fusion_boosted = True
            else:
                fusion_score = sim

            candidates.append({
                "product": p,
                "base_sim": sim,
                "fusion_score": fusion_score,
                "fusion_boosted": fusion_boosted
            })

        # ---------------------------------------------------------
        # Stage 3: Hard Exclusions Pass
        # ---------------------------------------------------------
        survivors = []
        
        # Parse negations
        exclude_colors_str = active_attrs.get("exclude_colors") or ""
        exclude_colors = [c.strip().lower() for c in exclude_colors_str.split(",") if c.strip()]
        
        exclude_fits_str = active_attrs.get("exclude_fits") or ""
        exclude_fits = [f.strip().lower() for f in exclude_fits_str.split(",") if f.strip()]
        
        exclude_types_str = active_attrs.get("exclude_types") or ""
        exclude_types = [t.strip().lower() for t in exclude_types_str.split(",") if t.strip()]

        for cand in candidates:
            p = cand["product"]
            exclude_item = False

            # 0. Exclude already shown products in this agent conversation session
            if session_context is not None and p["id"] in session_context.get("shown_products", []):
                exclude_item = True

            # 1. Hard Gender exclusion
            req_gender = active_attrs.get("gender")
            if req_gender:
                item_gender = (p.get("gender") or "").lower()
                req_gender_lower = req_gender.lower()
                if req_gender_lower == "boys":
                    req_gender_lower = "men"
                elif req_gender_lower == "girls":
                    req_gender_lower = "women"

                if req_gender_lower == "men" and item_gender == "women":
                    exclude_item = True
                elif req_gender_lower == "women" and item_gender == "men":
                    exclude_item = True

            # 2. Hard Price exclusion
            req_price_max = active_attrs.get("price_max")
            if req_price_max and float(p.get("price") or 0) > float(req_price_max):
                exclude_item = True

            # 3. Hard Color Negation exclusion (e.g. "not red")
            p_color = (p.get("color") or "").lower()
            p_color_family = (p.get("color_family") or "").lower()
            p_color_aliases = (p.get("color_aliases") or "").lower()
            for exc_color in exclude_colors:
                if (exc_color in p_color or 
                    exc_color in p_color_family or 
                    exc_color in p_color_aliases):
                    exclude_item = True
                    break

            # 4. Hard Structural/Fit Negation exclusions
            p_title = (p.get("title") or "").lower()
            p_desc = (p.get("description") or "").lower()
            p_type = (p.get("garment_type") or "").lower()
            
            # Direct fit exclusions
            for exc_fit in exclude_fits:
                if exc_fit in p_title or exc_fit in p_desc or exc_fit in p_type:
                    exclude_item = True
                    break

            # Direct structural type exclusions (e.g. "not a cardigan")
            for exc_type in exclude_types:
                if exc_type in p_title or exc_type in p_desc or exc_type in p_type:
                    exclude_item = True
                    break

            # Implicit structural rule: "pullover" query -> remove cardigans, button-up, zip-up
            q_lower = (query or "").lower()
            eq_lower = enriched_query.lower()
            if "pullover" in q_lower or "pullover" in eq_lower:
                cardigan_keywords = ["cardigan", "button-up", "zip-up", "button", "buttons", "zip"]
                if any(k in p_title or k in p_desc or k in p_type for k in cardigan_keywords):
                    exclude_item = True

            # Implicit structural rule: "turtleneck" query -> remove V-neck, crew neck, lapel
            if "turtleneck" in q_lower or "turtle neck" in q_lower or "turtleneck" in eq_lower:
                turtleneck_exclusions = ["v-neck", "v neck", "crew neck", "lapel"]
                if any(k in p_title or k in p_desc or k in p_type for k in turtleneck_exclusions):
                    exclude_item = True

            # Implicit structural rule: "sleeveless" query -> remove full-sleeve, long-sleeve, 3/4-sleeve
            if "sleeveless" in q_lower or "sleeveless" in eq_lower:
                sleeveless_exclusions = ["full-sleeve", "long-sleeve", "3/4-sleeve", "full sleeve", "long sleeve"]
                if any(k in p_title or k in p_desc or k in p_type for k in sleeveless_exclusions):
                    exclude_item = True

            if not exclude_item:
                survivors.append(cand)

        # ---------------------------------------------------------
        # Stage 4: Point-Based Boost Reranking
        # ---------------------------------------------------------
        final_candidates = []
        for cand in survivors:
            p = cand["product"]
            boost_score = 0.0
            reasons = []

            # A. Color Alias Boost (+0.25)
            req_color = active_attrs.get("color_family")
            p_color_family = (p.get("color_family") or "").lower()
            p_color_aliases = (p.get("color_aliases") or "").lower()
            p_color = (p.get("color") or "").lower()
            
            if req_color:
                req_color_lower = req_color.lower()
                # Check for direct match or substring in alias list
                if (req_color_lower == p_color_family or 
                    req_color_lower in p_color_aliases or 
                    req_color_lower in p_color):
                    boost_score += 0.25
                    reasons.append("color")

            # B. Category Boost (+0.20)
            req_category = active_attrs.get("category")
            if req_category and (p.get("category") or "").lower() == req_category.lower():
                boost_score += 0.20
                reasons.append("category")

            # C. Season Boost (+0.10)
            req_season = active_attrs.get("season")
            if req_season and (p.get("season") or "").lower() == req_season.lower():
                boost_score += 0.10
                reasons.append("season")

            # D. Fit Boost (+0.08)
            req_fit = active_attrs.get("fit")
            p_tags = (p.get("search_tags") or "").lower()
            p_type = (p.get("garment_type") or "").lower()
            p_desc = (p.get("description") or "").lower()
            if req_fit:
                req_fit_lower = req_fit.lower()
                if (req_fit_lower in p_type or 
                    req_fit_lower in p_tags or 
                    req_fit_lower in p_desc):
                    boost_score += 0.08
                    reasons.append("fit")

            # E. Texture Boost (+0.08)
            req_texture = active_attrs.get("texture")
            if req_texture:
                req_tex_lower = req_texture.lower()
                if (req_tex_lower in p_type or 
                    req_tex_lower in p_tags or 
                    req_tex_lower in p_desc):
                    boost_score += 0.08
                    reasons.append("texture")

            # F. Usage Boost (+0.05)
            req_usage = active_attrs.get("usage_type")
            if req_usage and (p.get("usage_type") or "").lower() == req_usage.lower():
                boost_score += 0.05
                reasons.append("usage")

            # G. Fusion Boost tag
            if cand["fusion_boosted"]:
                reasons.append("dual-path fusion")

            # Total score combines Stage 2 boosted similarity + Stage 4 boosts
            score = cand["fusion_score"] + boost_score
            
            # Format reasons as a human readable string
            match_reason_str = "Matched on: " + ", ".join(reasons) if reasons else "Matched on: semantic similarity"

            final_candidates.append({
                "product": p,
                "base_sim": cand["base_sim"],
                "boost_score": boost_score,
                "fusion_score": cand["fusion_score"],
                "final_score": score,
                "match_reason": match_reason_str
            })

        # ---------------------------------------------------------
        # Stage 5: Return Top 10 with Engagement Ranking
        # ---------------------------------------------------------
        if not final_candidates:
            return []

        product_ids = [c["product"]["id"] for c in final_candidates]

        # Fetch real orders from database to calculate engagement popularity score
        order_counts = {}
        try:
            orders_res = self.client.table("orders").select("product_id").in_("product_id", product_ids).execute()
            for r in (orders_res.data or []):
                pid = r["product_id"]
                order_counts[pid] = order_counts.get(pid, 0) + 1
        except Exception as e:
            logger.error(f"Error fetching order data for engagement ranking: {e}")

        # Add engagement popularity boost
        for cand in final_candidates:
            pid = cand["product"]["id"]
            count = order_counts.get(pid, 0)
            # Popularity boost: +0.02 per order, capped at 0.10 max
            pop_boost = min(count * 0.02, 0.10)
            cand["popularity_score"] = pop_boost
            cand["final_score"] += pop_boost
            if pop_boost > 0:
                cand["match_reason"] += f", popularity (+{pop_boost:.2f})"

        # Sort descending by final score
        final_candidates.sort(key=lambda x: x["final_score"], reverse=True)

        # Slice top 10 or specified limit
        top_candidates = final_candidates[:limit]

        # Add to shown products list to avoid duplicate suggestions in future session turns
        if session_context is not None:
            for cand in top_candidates:
                pid = cand["product"]["id"]
                if pid not in session_context.get("shown_products", []):
                    session_context.setdefault("shown_products", []).append(pid)

        # Map back to API response structure
        results = []
        for cand in top_candidates:
            p = cand["product"]
            
            # Construct dictionary representing the Product Search Result
            result_item = {
                "id": p["id"],
                "title": p["title"],
                "description": p.get("description"),
                "visual_description": p.get("visual_description"),
                "price": float(p["price"]),
                "currency": p.get("currency", "৳"),
                "category": p["category"],
                "sub_category": p.get("sub_category"),
                "color": p.get("color"),
                "gender": p.get("gender"),
                "image_url": p.get("image_url"),
                "is_corrupted": p.get("is_corrupted", False),
                "original_name": p.get("original_name"),
                "similarity": cand["final_score"], # Match UI expectations
                "match_reason": cand["match_reason"]
            }
            results.append(result_item)

        return results

    async def _extract_attributes(self, query: Optional[str] = None, image_bytes: Optional[bytes] = None) -> Dict[str, Any]:
        """Uses Gemini to extract structured attributes. Falls back to OpenRouter (Qwen) then regex."""
        
        prompt = """You are a fashion AI search assistant. Analyze the user's fashion search query (text input, image input, or both) and extract structured search parameters.

If an image is provided, analyze the garment shown in detail.
If text is provided, merge the text constraints (e.g. "not red", "under ৳1500", "for women") with the image features.

Extract the following parameters:
1. "category": Broad category. Select ONLY from: ["Topwear", "Bottomwear", "Footwear", "Bags", "Watches", "Sunglasses", "Accessories", "Innerwear", "Ethnic", "Sportswear"]. Leave blank if not determined.
2. "garment_type": Precise, specific structural type (e.g., "double-breasted knee-length coat", "crew neck knitted pullover sweater", "slim fit jeans", "button-up cardigan").
3. "color_family": Primary color family from: ["black", "white", "blue", "red", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "teal", "khaki", "gold", "silver"].
4. "color_aliases": 3-5 synonyms or names representing the exact shade (e.g., "seafoam, mint, sage, celadon").
5. "gender": Select ONLY from: ["Men", "Women", "Unisex"]. Normalize "boys" -> "Men", "girls" -> "Women". ONLY specify if explicitly requested or clearly shown (e.g. "men's pullover" or "something similar for women").
6. "season": Select from: ["Summer", "Winter", "Fall", "Spring", "All-Season"].
7. "fit": e.g., "relaxed", "slim", "oversized", "regular".
8. "texture": e.g., "knit", "waffle-knit", "denim", "leather", "cotton", "wool".
9. "usage_type": Select from: ["Casual", "Formal", "Sports", "Ethnic", "Smart Casual"].
10. "price_max": Stated price budget ceiling in Taka (e.g., if "under ৳1500" extract 1500). Only set if a budget is explicitly requested in text.
11. "exclude_colors": Comma-separated list of colors to exclude (e.g., from "not red", "avoid blue", "nothing red" -> "red").
12. "exclude_fits": Comma-separated list of fits to exclude (e.g., "oversized").
13. "exclude_types": Comma-separated list of garment types/structures to exclude (e.g. if query says "pullover" or "sweater" but "not a cardigan", exclude "cardigan"; or if user says "pullover", structural rules imply excluding cardigans, button-up, zip-up).
14. "enriched_query": A clean, concise, attribute-rich string containing ONLY positive terms (no negations, no "not", no "avoid"). Expand vibes and colors (e.g., "seafoam" becomes "mint green sage celadon crew neck pullover sweater men winter knit"). This enriched query is used directly for CLIP semantic search.

Respond in a JSON object with these keys exactly."""

        contents = [prompt]
        
        # Load image if provided
        pil_image = None
        if image_bytes:
            from PIL import Image
            import io
            try:
                pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                contents.append(pil_image)
            except Exception as e:
                logger.error(f"Error parsing image bytes in Stage 1: {e}")

        # Add text constraint/query if provided
        if query:
            contents.append(f"\nUser text query constraint: {query}")

        attrs = {}
        # Try Gemini first
        try:
            response = self.gemini_svc.client.models.generate_content(
                model=self.gemini_svc.model_id,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=SearchQueryUnderstandingSchema,
                    temperature=0.0
                )
            )
            text = response.text.strip()
            attrs = json.loads(text)
        except Exception as e:
            logger.error(f"Stage 1 Gemini extraction failed: {e}")
            
            # Fallback 1: OpenRouter (Qwen)
            try:
                from app.services.openrouter_service import get_openrouter_service
                or_svc = get_openrouter_service()
                if or_svc.api_key:
                    if pil_image and image_bytes:
                        prompt_text = prompt + (f"\nUser text query constraint: {query}" if query else "")
                        response_text = await or_svc.chat_with_image(prompt_text, image_bytes, temperature=0.0)
                    else:
                        prompt_text = prompt + f"\nUser text query: {query}"
                        response_text = await or_svc.chat([{"role": "user", "content": prompt_text}], temperature=0.0)
                    
                    response_text = response_text.strip()
                    if response_text.startswith("```json"):
                        response_text = response_text[7:]
                    elif response_text.startswith("```"):
                        response_text = response_text[3:]
                    if response_text.endswith("```"):
                        response_text = response_text[:-3]
                        
                    response_text = response_text.strip()
                    attrs = json.loads(response_text)
                    logger.info(f"OpenRouter extraction succeeded: {attrs}")
            except Exception as or_err:
                logger.error(f"Stage 1 OpenRouter fallback extraction failed: {or_err}")

        # Fallback 2: Regex-based extraction if both LLMs fail and we have text query
        if not attrs and query:
            attrs = self._regex_extract_attributes(query)

        # Ensure enriched_query is always present
        if "enriched_query" not in attrs:
            # Build simple positive enriched query string from attributes or raw query
            positive_parts = []
            if attrs.get("color_family"):
                positive_parts.append(attrs["color_family"])
            if attrs.get("garment_type"):
                positive_parts.append(attrs["garment_type"])
            if attrs.get("category"):
                positive_parts.append(attrs["category"])
            if attrs.get("gender"):
                positive_parts.append(attrs["gender"])
            if attrs.get("fit"):
                positive_parts.append(attrs["fit"])
            if attrs.get("texture"):
                positive_parts.append(attrs["texture"])
            
            if not positive_parts and query:
                # Clean up negations from raw query
                raw_words = query.lower().split()
                clean_words = []
                skip = False
                for w in raw_words:
                    if w in ["not", "no", "avoid", "without", "except"]:
                        skip = True
                        continue
                    if skip:
                        skip = False
                        continue
                    clean_words.append(w)
                attrs["enriched_query"] = " ".join(clean_words)
            else:
                attrs["enriched_query"] = " ".join(positive_parts)

        # Normalize gender mapping
        if attrs and "gender" in attrs:
            gender_val = attrs["gender"]
            if gender_val in ["Boys", "boys"]:
                attrs["gender"] = "Men"
            elif gender_val in ["Girls", "girls"]:
                attrs["gender"] = "Women"

        return attrs

    def _regex_extract_attributes(self, query: str) -> Dict[str, Any]:
        """Fallback regex-based attribute extraction when Gemini/Qwen are unavailable."""
        import re
        attrs = {}
        query_lower = query.lower()

        # Gender extraction
        gender_map = {
            r"\bmen'?s?\b": "Men",
            r"\bwomen'?s?\b": "Women",
            r"\bboy'?s?\b": "Men",
            r"\bgirl'?s?\b": "Women",
            r"\bunisex\b": "Unisex",
            r"\bfor men\b": "Men",
            r"\bfor women\b": "Women",
            r"\bmale\b": "Men",
            r"\bfemale\b": "Women",
        }
        for pattern, gender in gender_map.items():
            if re.search(pattern, query_lower):
                attrs["gender"] = gender
                break

        # Category extraction
        category_keywords = {
            "Topwear": ["shirt", "t-shirt", "tshirt", "top", "blouse", "sweater", "hoodie", "jacket", "coat", "blazer", "polo", "vest", "cardigan", "turtleneck", "turtle neck", "sweatshirt", "pullover", "kurta", "tank top"],
            "Bottomwear": ["pants", "jeans", "trouser", "shorts", "skirt", "legging", "chino", "jogger", "palazzo", "capri"],
            "Footwear": ["shoes", "sneakers", "sandals", "boots", "heels", "loafers", "flip flops", "slippers", "flats"],
            "Bags": ["bag", "handbag", "backpack", "clutch", "tote", "purse", "wallet", "satchel"],
            "Watches": ["watch", "watches", "smartwatch"],
            "Sunglasses": ["sunglasses", "shades", "eyewear"],
            "Accessories": ["belt", "scarf", "hat", "cap", "tie", "gloves", "jewelry", "bracelet", "necklace", "ring", "earring"],
            "Innerwear": ["underwear", "bra", "boxers", "briefs", "lingerie", "socks", "innerwear"],
            "Ethnic": ["saree", "sari", "lehenga", "kurta", "kurti", "sherwani", "salwar", "dupatta"],
            "Sportswear": ["sports", "athletic", "gym", "workout", "running", "yoga", "tracksuit", "jersey"],
        }
        for category, keywords in category_keywords.items():
            for keyword in keywords:
                if keyword in query_lower:
                    attrs["category"] = category
                    break
            if "category" in attrs:
                break

        # Color extraction with fashion color family mapping
        color_family_mappings = {
            "green": ["green", "seafoam", "mint", "sage", "celadon", "pistachio", "olive", "teal"],
            "white": ["white", "ivory", "cream", "off-white", "ecru", "bone", "oat"],
            "red": ["red", "burgundy", "wine", "maroon", "bordeaux", "crimson", "scarlet"],
            "blue": ["blue", "navy", "indigo", "midnight blue"],
            "brown": ["brown", "khaki", "tan", "camel", "taupe", "terracotta", "rust", "cognac", "chocolate", "espresso"],
            "pink": ["pink", "blush", "rose", "mauve", "dusty pink"],
            "purple": ["purple", "lavender", "lilac", "violet"],
            "grey": ["grey", "gray", "charcoal", "slate", "anthracite"],
            "black": ["black"]
        }
        
        matched_color = None
        for family, aliases in color_family_mappings.items():
            for alias in aliases:
                if alias in query_lower:
                    matched_color = family
                    attrs["color_family"] = family
                    attrs["color_aliases"] = ", ".join(aliases)
                    break
            if matched_color:
                break

        # Basic budget extraction
        budget_match = re.search(r"(?:under|below|budget|max|limit)\s*৳?\s*(\d+)", query_lower)
        if budget_match:
            attrs["price_max"] = float(budget_match.group(1))

        # Basic color negation extraction
        negation_match = re.search(r"(?:not|avoid|no|without|except)\s+([a-zA-Z]+)", query_lower)
        if negation_match:
            negated_word = negation_match.group(1)
            attrs["exclude_colors"] = negated_word

        logger.info(f"Fallback regex extraction: {attrs}")
        return attrs
