"""
CLIP Service — Handles loading CLIP ViT-B/32 model and encoding text/images.
Uses open-clip-torch for pip-installable CLIP with identical embeddings to OpenAI's original.
"""

import io
import numpy as np
from PIL import Image
from functools import lru_cache
from typing import Optional

import torch
import open_clip

from app.config import get_settings


class CLIPService:
    """Singleton CLIP model service for encoding text and images."""

    def __init__(self):
        self.model = None
        self.preprocess = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._loaded = False

    def _ensure_loaded(self):
        """Lazy-load the CLIP model on first use."""
        if self._loaded:
            return

        settings = get_settings()
        print(f"[CLIP] Loading model {settings.clip_model} on {self.device}...")

        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            settings.clip_model,
            pretrained=settings.clip_pretrained,
            device=self.device,
        )
        self.tokenizer = open_clip.get_tokenizer(settings.clip_model)
        self.model.eval()
        self._loaded = True

        print(f"[CLIP] Model loaded successfully on {self.device}")

    def encode_text(self, text: str) -> np.ndarray:
        """Encode a text string into a 512-dimensional CLIP embedding."""
        self._ensure_loaded()

        with torch.no_grad():
            tokens = self.tokenizer([text]).to(self.device)
            text_features = self.model.encode_text(tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        return text_features.cpu().numpy().flatten()

    def encode_texts_batch(self, texts: list[str]) -> np.ndarray:
        """Encode multiple text strings into CLIP embeddings (batch)."""
        self._ensure_loaded()

        with torch.no_grad():
            tokens = self.tokenizer(texts).to(self.device)
            text_features = self.model.encode_text(tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        return text_features.cpu().numpy()

    def encode_image(self, image_input) -> np.ndarray:
        """
        Encode an image into a 512-dimensional CLIP embedding.
        Accepts: bytes, PIL.Image, or file path.
        """
        self._ensure_loaded()

        # Convert input to PIL Image
        if isinstance(image_input, bytes):
            pil_image = Image.open(io.BytesIO(image_input)).convert("RGB")
        elif isinstance(image_input, Image.Image):
            pil_image = image_input.convert("RGB")
        else:
            pil_image = Image.open(image_input).convert("RGB")

        with torch.no_grad():
            processed = self.preprocess(pil_image).unsqueeze(0).to(self.device)
            image_features = self.model.encode_image(processed)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        return image_features.cpu().numpy().flatten()

    def combine_embeddings(
        self,
        visual_embedding: np.ndarray,
        text_embedding: np.ndarray,
        image_weight: Optional[float] = None,
    ) -> np.ndarray:
        """
        Combine visual and text embeddings with weighted average + L2 normalization.
        Default weight: 60% visual, 40% text (image is truth).
        """
        if image_weight is None:
            settings = get_settings()
            image_weight = settings.image_weight

        text_weight = 1.0 - image_weight

        combined = (image_weight * visual_embedding) + (text_weight * text_embedding)

        # L2 normalize
        norm = np.linalg.norm(combined)
        if norm > 0:
            combined = combined / norm

        return combined

    def cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings."""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


@lru_cache()
def get_clip_service() -> CLIPService:
    """Get singleton CLIP service instance."""
    return CLIPService()
