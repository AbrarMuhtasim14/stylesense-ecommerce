"""
Script to ingest the company policy document into vector embeddings.
Run this after creating the policy_embeddings table in Supabase.

Usage:
  cd backend
  .venv/Scripts/python -m scripts.ingest_policy
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.services.policy_rag_service import PolicyRAGService


def main():
    print("=" * 60)
    print("Policy Document Ingestion")
    print("=" * 60)

    svc = PolicyRAGService()
    count = svc.ingest_policy()
    print(f"\nSuccessfully ingested {count} policy chunks into vector embeddings!")
    print("The agent can now answer policy questions using RAG.")


if __name__ == "__main__":
    main()
