# StyleSense — Multimodal AI E-Commerce Platform

**StyleSense** is a full-stack fashion e-commerce platform powered by multimodal AI. The system uses CLIP embeddings and Gemini vision to understand product images directly, enabling search that works even when catalog metadata is wrong.

## Core Concept

> The image is always truth.

StyleSense builds search indexes from product images, not product text. When a shopper searches for "mint green waffle knit sweater," the system returns the right product even if its title says "Black Formal Blazer" — because the AI looked at the image and knows what it actually is.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Python, FastAPI |
| Database | Supabase (PostgreSQL + pgvector) |
| File Storage | Supabase Storage |
| Search | CLIP ViT-B/32 embeddings + pgvector cosine similarity |
| Vision AI | Google Gemini 2.5 Flash |
| Agent AI | Google Gemini 2.5 Flash (conversational + tool use) |

## Project Structure

```
stylelence/
├── backend/          # FastAPI + CLIP + Gemini
│   ├── app/          # Application code
│   ├── scripts/      # Seeding & utility scripts
│   └── Dockerfile    # HuggingFace Spaces deployment
├── frontend/         # Next.js 14+ with App Router
│   └── src/          # Source code
├── database/         # SQL schema & migrations
└── README.md
```

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 7860
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` and fill in your credentials:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `SUPABASE_STORAGE_BUCKET` — Storage bucket name
- `GEMINI_API_KEY` — Google Gemini API key
- `ADMIN_PASSWORD` — Admin portal password
- `IMAGE_WEIGHT` — Visual/text embedding weight (default: 0.6)

## License

Private — All rights reserved.
