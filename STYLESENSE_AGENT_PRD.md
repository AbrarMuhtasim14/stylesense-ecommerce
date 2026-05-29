# StyleSense — Agent Build PRD (Refined Production Edition)

## Refined Production Reality — Updated May 2026

---

## WHO YOU ARE

You are a senior full-stack AI engineer building a production-quality multimodal AI e-commerce platform. This PRD outlines the exact architectural decisions, luxury design system, and catalog management pipelines implemented in the production application.

---

## THE PROBLEM TO SOLVE

E-commerce search is broken. Shoppers describe products in human language, while catalogs store products in dry merchant language. They rarely match. A shopper who types "pistachio waffle-knit crew neck sweater" gets zero results if the merchant cataloged the product as "Mint Green Knit Top." Same product, different words, search fails.

The deeper problem is that product catalog metadata cannot be trusted as the sole source of truth. Merchants mislabel colors, write incomplete descriptions, or skip attributes entirely. Any search system that relies only on text will always be limited by the quality of that text.

StyleSense solves this with one principle: **the image is always truth.**

The AI looks at every product image directly and understands what the product actually looks like — color, texture, silhouette, material, style — independently of whatever text was written about it. Search works by comparing what the shopper described or showed against what products actually look like, not what they are called in a spreadsheet.

---

## WHAT YOU ARE BUILDING

A premium full-stack web application called **StyleSense** featuring:

1. **Luxury Minimalist Storefront**: A stark, image-forward editorial design system inspired by high-end luxury fashion brands (e.g. *Jil Sander*).
2. **Two-Stage AI Multimodal Search Engine**: Advanced text + image vector search utilizing local CLIP embeddings blended with Google Gemini visual analysis.
3. **Conversational AI Shopping Assistant**: StyleSense AI chat widget for product finding, styling advice, and order management.
4. **Admin Catalog Portal**: Advanced product uploading, editing, and pruning (hard delete) panel.

---

## PRODUCTION TECHNOLOGY STACK

The application is built using the following technologies:

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | React framework, TypeScript, custom Vanilla CSS |
| **Backend** | Python, FastAPI | High-performance async API backend |
| **Database** | Supabase (PostgreSQL) | Stores products, orders, and vector data |
| **Vector Engine** | Supabase `pgvector` | Handles 512-dimensional cosine similarity matching |
| **File Storage** | Supabase Storage | Hosts product images |
| **Local Search AI**| CLIP `ViT-B/32` (open-clip) | Encodes images and text into search vectors |
| **Vision AI** | Google Gemini 2.5 Flash | Translates uploaded query images into clean garment descriptions |
| **Agent AI** | Google Gemini 2.5 Flash | Powers the chat widget with function calling tools |

---

## PHASE 1 — DATA FOUNDATION & RESILIENCE

### Step 1.1 — Stream fashion dataset
Products are Curated from the `ceyda/fashion-products-small` HuggingFace dataset containing real Myntra catalog items. The seeding pipeline streams metadata to pull outerwear (Jackets, Coats, Sweaters) for Men and Women, avoiding heavy downloads.

### Step 1.2 — Rate-Limit Guard & Seeding
To protect against database clutter and save Gemini API credits:
- The script `generate_descriptions.py` automatically exits (`sys.exit()`) on Gemini `429 Quota Exceeded` errors.
- Clean rollback is executed, ensuring incomplete/placeholder data is not left in the database.
- A total of **80 high-quality products** have been seeded, with **58 products** fully visual-analyzed and CLIP-embedded.

### Step 1.3 — AI Descriptions
For each product:
- **visual_description**: A precise 3-sentence visual inventory (color, silhouette, neckline, fabric texture, fit, styling details) generated from the image. This acts as the *vector search truth*.
- **description**: A beautiful, customer-facing 4-sentence copywriter description used in UI product pages.

### Step 1.4 — Embedding Vector Blending
Three 512-dimensional vectors are stored in Supabase:
- `visual_embedding`: Encodes the product image directly.
- `text_embedding`: Encodes Gemini's `visual_description + color + category`.
- `combined_embedding`: Built using a weighted blend:
  $$\text{Combined Vector} = (0.6 \times \text{Visual Embedding}) + (0.4 \times \text{Text Embedding})$$
  This is L2-normalized, ensuring image features dominate text labels.

### Step 1.5 — Intentionally Corrupting Products (Demo Proof)
To demonstrate vector truth, 15-20 products are intentionally corrupted (display titles and descriptions swapped with completely mismatched items, e.g. a Royal Blue Dress labeled as a Plaid Flannel Shirt). Because visual descriptions and vector embeddings remain intact, searching for "Royal Blue Dress" surfaces the dress instantly, proving visual truth overrides merchant mistakes.

---

## PHASE 2 — DATABASE SCHEMA

PostgreSQL is configured in Supabase with these structures:
- **`products` table**: Stores metadata, `is_corrupted` flags, and `original_name`.
- **`product_embeddings` table**: Stores `visual_embedding`, `text_embedding`, and `combined_embedding` vectors (512-d). Linked via a foreign key `product_id` with `ON DELETE CASCADE`.
- **`match_products` function**: Stored database procedure running cosine similarity searches:
  ```sql
  (1 - (pe.combined_embedding <=> query_embedding))::float AS similarity
  ```
- **`orders` table**: Stores mock customer orders with status controls (processing, shipped, delivered, cancelled).

---

## PHASE 3 — MULTIMODAL AI SEARCH

### 1. Natural Language Text Search
The query text is encoded using the local CLIP text encoder into a 512-d vector and matched against `combined_embedding` in Postgres. Results are dynamically analyzed by `compute_ai_vision_match` to calculate the text-relevance score. If visual similarity is high but text-relevance is low, the product is flagged as `is_ai_vision_match = true` to display the AI Vision Match badge.

### 2. Two-Stage Image Upload Search
Noisy real-world photos (screenshots with text, blurry backgrounds, lighting distortions) pollute raw CLIP visual embeddings. StyleSense solves this using a two-stage approach:
- **Stage 1 — Gemini Vision (Filter)**: The photo is uploaded to Gemini 2.5 Flash with instructions to *ignore background, person wearing the item, and lighting*, extracting a clean 2-sentence description of ONLY the garment.
- **Stage 2 — CLIP Text Encoding**: The clean Gemini description is encoded by the local CLIP text encoder. If a text constraint exists (e.g. "must be black"), the constraint and Gemini vectors are blended. The resulting vector runs against the catalog's `combined_embeddings`.
- **Graceful Fallback**: If Gemini hits a rate limit or goes offline, the endpoint automatically falls back to raw local CLIP image encoding.

---

## PHASE 4 — LUXURY FRONTEND REDESIGN (JIL SANDER AESTHETIC)

The storefront features an elite, premium luxury fashion styling that completely avoids "micro-saas tech demo" visual bloat:
- **Monochrome Design System**: Standardizes on strict grayscales (`#000`, `#111`, `#fff`) with high-contrast minimalist typography. Heavy neon/purple gradients are entirely stripped away.
- **Minimal Homepage Hero**: A clean layout displaying high-fashion editorial vibes. A simple, unified search box is displayed alongside the hero subtext: *"Our e-commerce has eyes ✨"*. Technical stats and specs banners are removed.
- **Clean Product Detail Pages**: Replaced the intrusive "AI Vision / What AI Sees" visual analysis tab with a clean, immersive product presentation, while quietly running visual search logic behind the scenes.
- **Elegantly Dynamic AI Badges**: The AI Vision Match badge displays as a subtle monochrome sparkle instead of pulsing neon gradients, providing visual elegance.

---

## PHASE 5 — CATALOG MANAGEMENT & LIFECYCLE (GOING FORWARD)

StyleSense handles long-term catalog administration cleanly in the password-protected admin dashboard:

1. **Adding Products**: Admin uploads a product image and fills metadata. The backend automatically uploads to storage, prompts Gemini for descriptions, generates all three vectors, and makes it searchable within seconds.
2. **Editing Products (`PATCH /admin/products/{id}`)**:
   - Supporting **image replacement**: Uploads new assets to Supabase Storage, calls Gemini for a fresh visual description, and re-computes visual, text, and combined embeddings.
   - Supporting **metadata updates**: If text fields impacting search (`title`, `color`, `category`) are changed, the system automatically runs the local CLIP text encoder to regenerate text and combined embeddings. This is done locally on the server at **zero API cost**, keeping database search indexes fully synchronized with catalog edits.
   - Includes a checkbox to force Gemini description regeneration for existing images if needed.
3. **Removing Products (`DELETE /admin/products/{id}`)**:
   - Implements a secure **hard delete** pipeline (as chosen by the administrator). 
   - A minimalist, overlay-blurred confirmation dialog verifies intentions.
   - Deleting the product cascades to automatically wipe associated embedding vectors from Postgres, ensuring pristine database hygiene.

---

## ACCEPTANCE CRITERIA

1. Typing natural queries (e.g., "cozy green outerwear") surfaces items based on visual characteristics even if catalog text is corrupted.
2. Dragging/uploading a photo isolates the garment using Gemini and finds matches via pgvector.
3. The catalog displays WebP images served directly from Supabase Storage.
4. Admins can upload, modify details, replace images, and trigger Gemini updates.
5. Deleting a product permanently purges it and its vectors.
6. The chat agent recommends product cards via carousel function-calling tools.
7. Next.js and FastAPI backends compile successfully with zero TypeScript compilation errors.

---

*StyleSense Production PRD v4.0 — May 2026
Elite AI-Powered Luxury Fashion Store*
