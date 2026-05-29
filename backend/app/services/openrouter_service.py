"""
OpenRouter Fallback Service — Provides LLM capabilities via OpenRouter API
when Gemini is rate-limited (429 RESOURCE_EXHAUSTED).

Uses qwen/qwen3-vl-32b-instruct for both text chat and vision tasks.
"""

import json
import base64
import logging
import httpx
from typing import Optional, List, Dict, Any

from app.config import get_settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterService:
    """Fallback LLM service using OpenRouter API."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.openrouter_api_key
        self.model = settings.openrouter_model

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://stylesense.com",
            "X-Title": "StyleSense AI",
        }

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        response_format: Optional[str] = None,
    ) -> str:
        """
        Send a chat completion request to OpenRouter.
        Returns the assistant's text response.
        """
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                OPENROUTER_BASE,
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data.get("choices", [{}])[0]
        content = choice.get("message", {}).get("content", "")

        # Qwen3 may wrap responses in <think> tags — strip them
        if "<think>" in content:
            # Remove everything between <think> and </think>
            import re
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

        return content

    async def chat_with_image(
        self,
        text_prompt: str,
        image_bytes: bytes,
        temperature: float = 0.3,
        max_tokens: int = 512,
    ) -> str:
        """
        Send a vision request with an image to OpenRouter.
        """
        b64_image = base64.b64encode(image_bytes).decode("utf-8")

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": text_prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{b64_image}",
                        },
                    },
                ],
            }
        ]

        return await self.chat(messages, temperature=temperature, max_tokens=max_tokens)

    async def extract_attributes(self, query: str) -> Dict[str, Any]:
        """
        Extract fashion attributes from a search query using OpenRouter.
        Fallback for Gemini attribute extraction.
        """
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a fashion search query parser. Extract attributes from search queries. "
                    "Return ONLY valid JSON with keys: category, color, gender. "
                    "Omit keys not found. "
                    "Valid categories: Topwear, Bottomwear, Footwear, Bags, Watches, Sunglasses, Accessories, Innerwear, Ethnic, Sportswear. "
                    "Valid genders: Men, Women, Unisex, Boys, Girls."
                ),
            },
            {
                "role": "user",
                "content": f'Extract attributes from: "{query}"',
            },
        ]

        try:
            result = await self.chat(
                messages, temperature=0.0, max_tokens=128, response_format="json_object"
            )
            # Strip markdown code fences if present
            result = result.strip()
            if result.startswith("```"):
                result = result.split("\n", 1)[-1].rsplit("```", 1)[0]
            return json.loads(result)
        except Exception as e:
            logger.error(f"OpenRouter attribute extraction failed: {e}")
            return {}

    async def agent_chat(
        self,
        system_prompt: str,
        conversation_history: List[Dict[str, str]],
        user_message: str,
        available_tools: Optional[List[Dict]] = None,
    ) -> str:
        """
        Conversational agent chat without tool calling.
        For OpenRouter, we handle tools by describing them in the system prompt
        and parsing the response manually.
        """
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(conversation_history)
        messages.append({"role": "user", "content": user_message})

        return await self.chat(messages, temperature=0.7, max_tokens=1024)


_openrouter_service = None


def get_openrouter_service() -> OpenRouterService:
    """Get singleton OpenRouter service."""
    global _openrouter_service
    if _openrouter_service is None:
        _openrouter_service = OpenRouterService()
    return _openrouter_service
