import asyncio
import os
import sys

# Ensure backend folder is in path to import app services
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.services.openrouter_service import get_openrouter_service

artifacts_dir = r"C:\Users\USER\.gemini\antigravity\brain\1d48845d-7212-469f-a67b-78cdb69d1c36"
output_file = r"f:\stylelence\backend\image_descriptions.txt"

async def main():
    or_svc = get_openrouter_service()
    images = ["image1.png", "image2.png", "image3.png"]
    
    with open(output_file, "w", encoding="utf-8") as out_f:
        for img_name in images:
            img_path = os.path.join(artifacts_dir, img_name)
            if not os.path.exists(img_path):
                out_f.write(f"File {img_path} does not exist.\n\n")
                continue
                
            out_f.write(f"\n=================== Analyzing {img_name} ===================\n")
            try:
                with open(img_path, "rb") as f:
                    img_bytes = f.read()
                    
                prompt = (
                    "This is a screenshot from our stylelence e-commerce web application. "
                    "Please describe what you see in the screenshot. Specifically look for:\n"
                    "1. The search input or the message sent by the user to the agent.\n"
                    "2. The response or products shown in the chat widget or search results page.\n"
                    "3. Any error messages, incorrect categories, or mismatch in products.\n"
                    "Explain the exact issue depicted in this screenshot."
                )
                response = await or_svc.chat_with_image(prompt, img_bytes)
                out_f.write(response)
                out_f.write("\n\n")
                print(f"Successfully analyzed {img_name}")
            except Exception as e:
                out_f.write(f"Error describing {img_name}: {e}\n\n")
                print(f"Error analyzing {img_name}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
