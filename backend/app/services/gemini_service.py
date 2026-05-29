"""
Gemini Service — Google Gemini 2.5 Flash for vision and chat capabilities.
Uses the new google-genai SDK (replaces deprecated google-generativeai).
"""

from google import genai
from google.genai import types
from PIL import Image
import io
from functools import lru_cache

from app.config import get_settings


class GeminiService:
    """Service for Gemini AI interactions — vision descriptions and chat."""

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_id = settings.gemini_model

    async def generate_visual_description(self, image_bytes: bytes) -> str:
        """
        Generate a visual description of a product image using Gemini vision.
        Falls back to OpenRouter if Gemini is rate-limited.
        """
        prompt = """You are a fashion product analyst. Look at this product image and provide exactly two things:

1. A visual_description: Write exactly 3 sentences describing ONLY what you literally see in the image.
   Focus on: the exact color(s) and any alternative color it could be called, the clothing/accessory type,
   the texture or material appearance, the neckline or cut style, the fit (slim, relaxed, oversized),
   and any notable visual details (patterns, logos, hardware, stitching).
   Do NOT reference any brand names or text. Only describe visual attributes.

Respond with ONLY the 3-sentence visual description, nothing else."""

        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[prompt, pil_image],
            )
            return response.text.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                try:
                    from app.services.openrouter_service import get_openrouter_service
                    or_svc = get_openrouter_service()
                    if or_svc.api_key:
                        return await or_svc.chat_with_image(prompt, image_bytes)
                except Exception:
                    pass
            raise

    async def generate_description_from_prompt(self, image_bytes: bytes, prompt: str) -> str:
        """
        Generate a description of an image using a custom prompt.
        Falls back to OpenRouter vision if Gemini is rate-limited.
        """
        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[prompt, pil_image],
            )
            return response.text.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                # Fallback to OpenRouter vision
                try:
                    from app.services.openrouter_service import get_openrouter_service
                    or_svc = get_openrouter_service()
                    if or_svc.api_key:
                        return await or_svc.chat_with_image(prompt, image_bytes)
                except Exception as or_e:
                    raise Exception(f"Both Gemini and OpenRouter failed: {or_e}")
            raise

    async def generate_product_description(self, image_bytes: bytes) -> str:
        """
        Generate a customer-facing product description (4 sentences).
        Falls back to OpenRouter vision if Gemini is rate-limited.
        """
        prompt = """You are a fashion copywriter for a premium e-commerce store. Look at this product image
and write exactly 4 sentences as a product description that a shopper would read on the product page.

Be descriptive, appealing, and mention the key style features.
Do NOT include any brand names. Focus on the visual attributes, styling potential, and appeal.

Respond with ONLY the 4-sentence product description, nothing else."""

        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[prompt, pil_image],
            )
            return response.text.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                # Fallback to OpenRouter vision
                try:
                    from app.services.openrouter_service import get_openrouter_service
                    or_svc = get_openrouter_service()
                    if or_svc.api_key:
                        return await or_svc.chat_with_image(prompt, image_bytes)
                except Exception as or_e:
                    raise Exception(f"Both Gemini and OpenRouter failed: {or_e}")
            raise

    async def generate_style_advice(
        self, product_description: str, occasion: str = "casual"
    ) -> str:
        """Generate styling advice for a product. Falls back to OpenRouter."""
        prompt = f"""You are a personal fashion stylist. A customer is asking about styling this product:

Product: {product_description}
Occasion: {occasion}

Give 3-4 sentences of practical styling advice — what to pair it with,
what occasions it suits, and what colors/accessories complement it.
Keep it conversational and helpful."""

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                try:
                    from app.services.openrouter_service import get_openrouter_service
                    or_svc = get_openrouter_service()
                    if or_svc.api_key:
                        return await or_svc.chat(
                            [{"role": "user", "content": prompt}],
                            temperature=0.7, max_tokens=512
                        )
                except Exception:
                    pass
            raise

    async def evaluate_evidence_necessity(self, reason: str) -> str:
        """
        Evaluate if a return/dispute reason requires uploading visual evidence.
        Returns a JSON string: {"needs_evidence": bool, "explanation": str}.
        Falls back to OpenRouter if Gemini rate limits.
        """
        prompt = f"""You are an e-commerce customer support supervisor evaluating a customer's return or dispute reason to decide if they need to upload photographic/visual evidence.

Rules:
1. Low-risk reasons do NOT need evidence (e.g., changed mind, doesn't fit, ordered wrong size, too large/small, didn't like the style, style is not what expected, arrived late, fits poorly).
2. High-risk or damage/quality issues DO need evidence (e.g., defective, broken zipper, torn fabric, ripped, holes, damaged, stained/dirty, wrong item sent, color is completely different from what was ordered, different design/pattern, incorrect label size vs physical fit, missing parts).

Analyze the customer's explanation:
"{reason}"

Output ONLY a valid JSON object with exactly two fields:
- "needs_evidence": boolean (true if visual evidence is required, false otherwise)
- "explanation": a 1-sentence explanation of the decision.

Example: {{"needs_evidence": true, "explanation": "Visual evidence is required to verify the claim of a broken zipper."}}

Response:"""

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            return response.text.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                try:
                    from app.services.openrouter_service import get_openrouter_service
                    or_svc = get_openrouter_service()
                    if or_svc.api_key:
                        messages = [
                            {
                                "role": "system",
                                "content": "You are a customer support evaluator. Output ONLY a valid JSON object with keys: needs_evidence (boolean) and explanation (string)."
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ]
                        return await or_svc.chat(messages, temperature=0.0, max_tokens=150, response_format="json_object")
                except Exception:
                    pass
            raise

    async def enrich_product_metadata(self, image_bytes: bytes) -> dict:
        """
        Extract structured search metadata (color_family, color_aliases, garment_type, search_tags)
        from a product image. Falls back to OpenRouter Qwen if Gemini rate limits.
        """
        from pydantic import BaseModel
        import json
        
        class CatalogEnrichment(BaseModel):
            color_family: str
            color_aliases: str
            garment_type: str
            search_tags: str
            
        prompt = """You are a fashion product analyst. Look at this product image and extract the following structured attributes:

1. "color_family": Select the single best matching primary color family from this list: ["black", "white", "blue", "red", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "teal", "khaki", "gold", "silver"]. It must be a single word from this list.
2. "color_aliases": A comma-separated list of synonyms and descriptive color names a shopper might type (e.g. for a mint green sweater, this might be "seafoam, mint, sage, celadon, aqua mint, pale teal, soft green"). Provide 5-8 descriptive color synonyms representing the exact shade.
3. "garment_type": The precise, specific garment type. For example, "double-breasted knee-length wool blend coat with lapel collar" or "crew neck knitted pullover sweater". Be extremely precise and structural.
4. "search_tags": 12-15 comma-separated phrases a shopper would type to search for this product (e.g. "mint green sweater, men winter knit, warm cozy pullover, seafoam knitwear, casual sweater, winter crewneck, pastel green pullover"). Do NOT use any brand names. Ensure to include colors, garment type, fit, season, occasion, texture, and neckline.

Respond with a JSON object containing these keys exactly:
"color_family", "color_aliases", "garment_type", "search_tags"."""

        # Try Gemini 2.5 Flash first
        try:
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[prompt, pil_image],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=CatalogEnrichment,
                    temperature=0.0
                ),
            )
            data = json.loads(response.text.strip())
            if all(k in data for k in ["color_family", "color_aliases", "garment_type", "search_tags"]):
                return data
        except Exception as e:
            error_str = str(e).lower()
            if not ("429" in error_str or "resource" in error_str or "quota" in error_str):
                raise

        # Fallback to OpenRouter (Qwen)
        try:
            from app.services.openrouter_service import get_openrouter_service
            or_svc = get_openrouter_service()
            if or_svc.api_key:
                response_text = await or_svc.chat_with_image(prompt, image_bytes, temperature=0.0)
                response_text = response_text.strip()
                
                # Clean up potential markdown fences
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                elif response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                    
                response_text = response_text.strip()
                data = json.loads(response_text)
                if all(k in data for k in ["color_family", "color_aliases", "garment_type", "search_tags"]):
                    return data
                else:
                    raise ValueError("Parsed JSON missing keys")
            else:
                raise ValueError("OpenRouter API key is not configured")
        except Exception as fallback_err:
            raise RuntimeError(f"Both Gemini and Qwen fallback failed for product metadata enrichment: {fallback_err}")



@lru_cache()
def get_gemini_service() -> GeminiService:
    """Get singleton Gemini service."""
    return GeminiService()
