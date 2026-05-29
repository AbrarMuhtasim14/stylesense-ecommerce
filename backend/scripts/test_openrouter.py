"""
Test OpenRouter — Standalone test for OpenRouter fallback connectivity.
"""

import sys
import os
import asyncio
import traceback
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

load_dotenv(override=True)

async def main():
    print("Testing OpenRouter connection...")
    from app.services.openrouter_service import get_openrouter_service
    or_svc = get_openrouter_service()
    
    print(f"API Key present: {bool(or_svc.api_key)}")
    print(f"Model: {or_svc.model}")
    
    try:
        messages = [{"role": "user", "content": "Hello, are you online? Respond in one word."}]
        print("Sending request to OpenRouter...")
        response = await or_svc.chat(messages, temperature=0.0)
        print(f"Response: {response}")
        print("OpenRouter connection works perfectly!")
    except Exception as e:
        print(f"OpenRouter connection failed: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
