"""
Policy RAG Service — Retrieval Augmented Generation for company policy documents.

Chunks the policy document, embeds each chunk using Gemini embeddings,
and stores them in a Supabase table for vector similarity search.
"""

import os
import re
import json
import logging
import numpy as np
from typing import List, Dict, Any, Optional

from app.config import get_settings
from app.models.database import get_supabase_client

logger = logging.getLogger(__name__)

# Path to the policy document
POLICY_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "policy.txt")


class PolicyRAGService:
    """RAG service for searching company policy documents."""

    def __init__(self):
        settings = get_settings()
        from google import genai
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.supabase = get_supabase_client()

    def _embed_text(self, text: str) -> List[float]:
        """Generate an embedding for a text chunk using Gemini.
        Truncates from 3072 to 768 dims to match the table schema.
        """
        result = self.client.models.embed_content(
            model="gemini-embedding-001",
            contents=text,
        )
        full_embedding = result.embeddings[0].values
        # Truncate to 768 dims to fit the policy_embeddings table
        return list(full_embedding[:768])

    async def search(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Search policy embeddings using vector similarity.
        Falls back to keyword search if the embeddings table doesn't exist.
        """
        try:
            # Try vector search first
            query_embedding = self._embed_text(query)

            result = self.supabase.rpc("match_policy_chunks", {
                "query_embedding": query_embedding,
                "match_count": top_k,
                "match_threshold": 0.3,
            }).execute()

            if result.data:
                return result.data
        except Exception as e:
            logger.warning(f"Vector policy search failed, falling back to keyword: {e}")

        # Fallback: keyword search on the raw policy text
        return self._keyword_search(query, top_k)

    def _keyword_search(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Fallback keyword search on the policy text file."""
        try:
            with open(POLICY_FILE, "r", encoding="utf-8") as f:
                content = f.read()
        except FileNotFoundError:
            return []

        # Split into sections
        sections = re.split(r'\n(?=SECTION \d+:)', content)
        query_lower = query.lower()
        query_words = set(query_lower.split())

        scored = []
        for section in sections:
            section = section.strip()
            if not section:
                continue
            section_lower = section.lower()
            # Score based on word overlap
            score = sum(1 for w in query_words if w in section_lower)
            if score > 0:
                scored.append({"content": section, "score": score})

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def ingest_policy(self) -> int:
        """
        Read the policy file, chunk it by section, embed each chunk,
        and store in the policy_embeddings table.
        Returns the number of chunks ingested.
        """
        with open(POLICY_FILE, "r", encoding="utf-8") as f:
            content = f.read()

        # Split by sections
        sections = re.split(r'\n(?=SECTION \d+:)', content)
        chunks = []
        for section in sections:
            section = section.strip()
            if not section or len(section) < 50:
                continue
            chunks.append(section)

        logger.info(f"Ingesting {len(chunks)} policy chunks")

        # Clear existing data
        try:
            self.supabase.table("policy_embeddings").delete().neq("id", 0).execute()
        except Exception:
            pass

        for i, chunk in enumerate(chunks):
            embedding = self._embed_text(chunk)
            self.supabase.table("policy_embeddings").insert({
                "chunk_index": i,
                "content": chunk,
                "embedding": embedding,
            }).execute()
            logger.info(f"  Ingested chunk {i+1}/{len(chunks)}")

        return len(chunks)
