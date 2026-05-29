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



@lru_cache()
def get_gemini_service() -> GeminiService:
    """Get singleton Gemini service."""
    return GeminiService()
