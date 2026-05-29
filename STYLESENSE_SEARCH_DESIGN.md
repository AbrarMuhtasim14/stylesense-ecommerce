# StyleSense — Search System Design
## Version 2.0 — Updated for production decisions and tech stack

---

## TECH STACK

- **Primary vision and language model:** Gemini (Google)
- **Fallback model:** Qwen (used when Gemini is unavailable or rate-limited)
- **Visual embeddings:** CLIP ViT-B/32 (local, CPU, no API cost)
- **Database and vector search:** Supabase with pgvector extension
- **Frontend framework:** Next.js
- **Backend framework:** FastAPI (Python)

---

## WHAT WENT WRONG — EVIDENCE FROM LIVE TESTING

### Failure 1 — Seafoam pullover search
Query: "seafoam pullover men"
Expected: mint green sweater at rank 1
Got: oat sweater 58%, cream sweater 54%, cardigan (button-up) 53%
The correct seafoam/mint sweater was buried at position 7 with 53% match

### Failure 2 — Image upload search
Uploaded: white coat image
Query constraint: "something similar for women"
Expected: white and similar coats, including corrupted black coat
Got: men's checkered shirt, rust blazer, cream sweater, men's vest
Zero coats returned. Men's items returned despite "for women" being explicit.
The corrupted black coat — the core proof-of-concept — was completely absent.

### Failure 3 — Negation ignored
Uploaded: white coat image
Query: "similar but not red"
Expected: red coat removed from results
Got: red coat still appearing at top. Negation had zero effect.

---

## ROOT CAUSES

### Root Cause 1 — Color has almost no weight in the embedding

When CLIP or a text embedding model encodes "seafoam pullover men" into
a single vector, the signal weight is approximately distributed as:

  sweater / knit / topwear → 60% of the vector direction
  men / masculine          → 25%
  seafoam / color          → 10%
  pullover / structure     →  5%

Color contributes only 10% of the vector signal. Every men's sweater
scores 50-58% regardless of color. A seafoam sweater and a cream sweater
are mathematically equal in this space. Color differentiation does not exist
in a single combined embedding.

### Root Cause 2 — Negation is mathematically invisible in embedding space

Embedding models capture semantic similarity, not logic.
"Not red" and "red coat" have approximately 0.91 cosine similarity.
The word "not" contributes near-zero directional change to the vector.
Searching "not red" actively finds red things. This is a known limitation
of all embedding-based search systems and cannot be fixed by improving
the embedding model. It requires a dedicated extraction and filter layer.

### Root Cause 3 — Image search has no category anchor

When a coat image is uploaded, the CLIP encoder includes background,
lighting, hanger, and general formal-garment signals all in one vector.
The resulting vector drifts toward "formal upper body garment" — which
overlaps with shirts, vests, and blazers almost as much as coats.
Gemini, if used without a structured prompt, writes generic descriptions
like "light-colored formal garment" which embed the same way.
Nothing enforces that a coat query returns coats.

### Root Cause 4 — Gender is a soft signal, not a wall

"For women" embedded in the query text influences the vector direction
slightly but does not exclude men's items. Men's products can score
near 52% on a "coat for women" query because "formal upper body garment"
dominates the signal. Gender has no hard boundary in embedding space.

### Root Cause 5 — Visual descriptions are prose, not structured data

Current visual descriptions read like: "A white formal coat suitable
for professional settings." This is good for human readers but poor
for search. It does not contain color synonyms, does not specify coat type,
does not include structural attributes, and embeds into a generic region
of the vector space that overlaps with many garment types.

---

## THE DATABASE CHANGES NEEDED

### Do not rebuild from scratch

The existing 100 products and their images are kept.
The existing products table is kept.
The existing product_embeddings table is kept.

### Add new columns to the products table

These new columns are populated by re-running Gemini on each product image.
The existing description and visual_description columns are not replaced.
They remain for customer-facing display.

New columns to add:

  color_family    text     -- single word: red, green, blue, white, black, etc.
  color_aliases   text     -- comma-separated synonyms Gemini generates from the image
  garment_type    text     -- precise type: "double-breasted wool trench coat"
  search_tags     text     -- 12-15 comma-separated searchable phrases

### Regenerate embeddings after adding new columns

Once search_tags and color_aliases are populated for all 100 products,
regenerate the combined_embedding using:

  combined_embedding = CLIP(product image) * 0.6
                     + CLIP(search_tags text) * 0.4

Using search_tags instead of generic prose gives the embedding far more
specific signal. Color names, garment types, style words, and occasion words
are all present in search_tags and will now influence the vector direction.

This is a one-time operation. A single script runs Gemini on all 100 images,
populates the new columns, and regenerates embeddings. Approximately 30 minutes.

---

## THE SEARCH PIPELINE — 5 STAGES

Every search — whether typed in the search box or sent through the agent —
passes through all 5 stages. No raw query ever reaches the database directly.

```
Customer input (text, image, or both)
          ↓
STAGE 1 — UNDERSTAND
  Gemini reads the input and extracts structured meaning.
  Separates what to include from what to exclude.
  Resolves color aliases. Identifies hard constraints.
  Outputs an enriched query with only positive terms.
          ↓
STAGE 2 — DUAL PATH SEARCH
  Path A: CLIP encodes enriched query → pgvector finds closest products
  Path B: SQL filter on structured attributes (color aliases, season, price)
  Results from both paths are merged and deduplicated.
          ↓
STAGE 3 — HARD FILTER PASS
  Gender exclusion (only hard filter on category type)
  Price range exclusion (if customer stated a budget)
  Color exclusion (from negations like "not red")
  Structural exclusion (from terms like "pullover" → removes cardigans)
  Any product failing a hard filter is removed entirely.
          ↓
STAGE 4 — BOOST RERANKING
  Color alias match    → +0.25 score boost
  Category match       → +0.20 score boost (soft, not a wall)
  Season match         → +0.10 score boost
  Fit match            → +0.08 score boost
  Texture match        → +0.08 score boost
  Usage type match     → +0.05 score boost
  Corrupted products receive no penalty — their embedding reflects visual truth.
          ↓
STAGE 5 — RETURN
  Top 10 by final boosted score.
  Each result includes similarity score and match reason metadata.
```

---

## STAGE 1 — QUERY UNDERSTANDING IN DETAIL

### What Gemini extracts from any query

For every query — text typed in the search box, image uploaded, or
message sent to the agent — Gemini produces a structured object with:

**Include signals** (what to find):
- Garment category and primary type
- Color terms expanded to aliases
- Gender preference
- Fit, texture, length, collar, closure, sleeve type
- Season and usage type
- Price range

**Exclude signals** (what to remove — negation handling):
- Excluded colors from "not red", "avoid blue", "nothing bright"
- Excluded fits from "not oversized", "not baggy", "not too fitted"
- Excluded structural types from "pullover" (removes cardigans),
  "turtleneck" (removes V-neck), etc.

**Enriched query** (what goes into CLIP for semantic search):
- All positive terms only
- No negations, no "not", no excluded terms
- Color aliases expanded: "seafoam" becomes "mint green sage celadon"
- Vague vibe words expanded: "cozy" becomes "soft warm knit relaxed"
- Concise, dense, attribute-rich string

**Hard filters** (what becomes SQL WHERE clauses):
- Gender: only when customer explicitly states it
- Price max: only when customer states a budget
- Everything else is either a boost or a soft exclusion

### When the customer uploads an image

Gemini analyzes the image before any embedding runs and extracts:
- Exact garment category and type family
- Precise color with all aliases
- Structural details: fit, length, collar, closure, sleeve
- Style vibe

These extracted attributes are merged with any text constraint the
customer typed alongside the image. The merged output feeds into
Stage 2 as if it were a single structured query.

The Gemini model used for image analysis is the primary model.
If Gemini is unavailable, Qwen is called as the fallback for image analysis.
CLIP then handles the actual embedding regardless of which model described the image.

### Gemini primary / Qwen fallback rule

Gemini is called first for all query understanding and image analysis.
If Gemini returns an error, times out, or hits a rate limit, Qwen is
called with the same prompt and input. The rest of the pipeline is
identical regardless of which model produced the structured output.
CLIP runs locally on CPU and is not affected by model availability.

---

## STAGE 2 — DUAL PATH SEARCH IN DETAIL

### Path A — Semantic vector search via CLIP and pgvector

The enriched query from Stage 1 is encoded by CLIP text encoder into
a 512-dimensional vector. This vector is compared against the
combined_embedding of every product using cosine similarity in pgvector.

The top 30 candidates are retrieved.

If an image was uploaded, the image is encoded by CLIP image encoder into
its own 512-dim vector. If both image and text enriched query are present,
they are combined: 50% image vector + 50% text vector, then normalized.
This combined query vector runs the pgvector search.

### Path B — SQL attribute filter search

The structured attributes from Stage 1 run as SQL WHERE conditions:
- color_aliases column checked against expanded color terms
- gender column checked if gender was specified
- season column checked if season was mentioned
- price column checked if price max was stated
- category column checked for category preference

Path B returns products with a base score. Products that appear in both
Path A and Path B receive a 20% fusion score boost before ranking.

---

## STAGE 3 — HARD FILTERS IN DETAIL

### The only hard category filter is gender

Based on the product decision made: category is a boost, not a wall.
If a customer uploads a coat image and there are no matching women's coats,
showing a similar women's blazer is better than returning nothing.
Category mismatch reduces the score. It does not produce an empty page.

Gender is the one exception. "For women" explicitly stated means no men's
items appear. This is a hard SQL exclusion, not a score penalty.

### Price is a hard filter when stated

If the customer says "under ৳1500" or "budget options", price_max is a
hard filter. Products above that price are excluded entirely.
Price is never a soft signal. It is either stated (hard wall) or absent (ignored).

### Negation handling — color exclusion

When the customer says "not red" or "avoid blue" or "nothing too bright",
Gemini extracts the excluded color terms in Stage 1.
After pgvector search retrieves candidates, a filter pass removes any product
whose color field or color_aliases field contains the excluded color.
This is applied after vector search because negation cannot be encoded
into the query vector — it must be handled as a post-processing exclusion.

### Structural exclusion

When the customer uses structural terms that imply exclusions:
- "pullover" implies no cardigans, no button-up, no zip-up
- "turtleneck" implies no V-neck, no crew neck, no lapel
- "sleeveless" implies no full-sleeve, no 3/4-sleeve

These exclusions are checked against the garment_type and visual_description
columns of each candidate product. Mismatches are removed.

---

## STAGE 4 — BOOST RERANKING IN DETAIL

### Why scoring clusters around 50-58%

Without boosting, every product in the same broad category scores
similarly because the dominant signal is the category itself.
All men's sweaters score 50-58% on a men's sweater query regardless
of color. The 8% spread is noise, not meaningful differentiation.

Boost reranking spreads the scores by rewarding specific attribute matches:

  Color alias match    +0.25   (a seafoam query finding a mint product)
  Category type match  +0.20   (a coat query finding a trench coat, not a blazer)
  Season match         +0.10   (a winter query finding a winter product)
  Fit match            +0.08   (a relaxed query finding a relaxed-fit product)
  Texture match        +0.08   (a waffle-knit query finding waffle-knit fabric)
  Usage type match     +0.05   (a casual query finding a casual-tagged product)

### Effect on the seafoam pullover case

Before boost: mint sweater 0.53, oat sweater 0.58, cream sweater 0.54
After color boost: mint sweater 0.53 + 0.25 = 0.78, others unchanged
Result: mint sweater rank 1, oat sweater rank 2 — correct outcome

### Corrupted products and boost reranking

Corrupted products receive no score penalty. The is_corrupted flag has
zero effect on search scoring. Their combined_embedding was generated
from the real product image before any text corruption occurred.
The vector reflects visual truth. Boost reranking works on color_aliases
and garment_type columns — which are also never corrupted.
A corrupted black coat that was in the outerwear category before corruption
is still in that category and still has the correct coat embedding.
It surfaces naturally whenever a coat or similar outerwear query runs.

---

## PRODUCT ATTRIBUTE CONTEXT IN SEARCH AND AGENT

Both the search box and the agent chat must understand and use all product
attributes — not just color and category.

The full list of attributes that influence search:

  Gender      → hard filter when explicitly stated
  Price       → hard filter when budget is stated
  Season      → soft boost when season mentioned
  Category    → soft boost (strong: +0.20)
  Color       → soft boost via alias matching (+0.25)
  Fit         → soft boost and structural exclusion
  Texture     → soft boost
  Usage type  → soft boost (casual / formal / sports / ethnic)
  Collar type → structural exclusion signal
  Closure     → structural exclusion signal (pullover vs button-up)
  Length      → soft boost when mentioned (midi, maxi, cropped)

### Search box context

Every query typed in the search box passes through Gemini query understanding.
Gemini extracts all relevant attributes from the natural language input.
The full set of extracted attributes feeds into the 5-stage pipeline.
The customer does not need to use any special syntax.

"something cozy for winter under ৳1500, not oversized, for women" extracts:
  gender = Women → hard filter
  price_max = 1500 → hard filter
  season = Winter → boost
  fit_exclude = oversized → structural exclusion
  texture_include = knit → boost
  enriched_query = "warm soft knit sweater relaxed women winter casual"

### Agent chat context — accumulated across the conversation

The agent maintains a shopping context object that grows across turns.
Each message adds to or refines the established context.
Every internal search the agent runs carries the full accumulated context.

Turn 1: "show me something warm for winter"
  → season = Winter, texture = knit or wool — added to context

Turn 2: "women's only please"
  → gender = Women added as hard filter — applies to all future searches

Turn 3: "under ৳1500"
  → price_max = 1500 added as hard filter

Turn 4: "not red please"
  → exclude_colors = [red] — applies to all future searches in this session

Turn 5: "do you have this in blue?"
  → "this" resolved to the product from Turn 3 via conversation history
  → search runs for same category and style but in blue
  → all previous context (women, under ৳1500, not red) still active

The customer never repeats a constraint. Established constraints persist
until the customer changes them. This is what makes the agent feel like
a real assistant rather than a stateless keyword search.

Products the agent has already shown are excluded from future searches
in the same session so the customer always sees new options.

---

## VISUAL DESCRIPTION — REDESIGNED FOR SEARCH

### The problem with prose descriptions

Current visual_description: "A white formal coat suitable for professional settings."

This is human-readable but search-useless. It does not contain:
- Precise color name or any synonyms
- Coat type (trench, pea, wrap, puffer, wool blend)
- Structural details (lapel, double-button, knee-length)
- Searchable style terms

When CLIP encodes this text, the vector lands in a generic region
that overlaps with many garment types and colors.

### The new structured format

Gemini is prompted to produce a structured description containing
specific machine-readable fields alongside human-readable prose.
The key fields that feed into search are stored as separate columns:

**color_aliases column** — all names a shopper might use for this color.
For a mint green sweater this might be: "seafoam, mint, sage, celadon,
aqua mint, pale teal, soft green, seafoam green"
This field is what the color boost reranking checks against.

**garment_type column** — the precise, specific type.
Not "coat" but "double-breasted knee-length wool blend coat with lapel collar"
This field is what the category boost and structural exclusion checks against.

**search_tags column** — 12-15 phrases a shopper would type to find this product.
This field is what CLIP encodes for the text embedding portion of combined_embedding.
Using dense, specific search tags instead of generic prose is the single biggest
improvement to embedding quality.

### When to regenerate

The new columns (color_aliases, garment_type, search_tags) must be populated
for all existing 100 products by running Gemini on each product image once.
After population, combined_embedding must be regenerated for all 100 products
using: 0.6 × CLIP(image) + 0.4 × CLIP(search_tags).

After this one-time update, any new product uploaded through the admin portal
automatically gets these fields populated via the same Gemini prompt at upload time.
No manual intervention needed for new products going forward.

---

## COLOR ALIAS SYSTEM

The color alias table resolves the gap between how shoppers describe colors
and how merchants label colors. It is used in two places:

At product ingestion: Gemini generates color_aliases for each product image
and stores them in the color_aliases column. This is the supply side.

At query time: Gemini extracts color terms from the query and expands them
using the alias table. This is the demand side.

Supply and demand meet in the boost reranking step where the query aliases
are compared against the product color_aliases column.

The alias table covers the most common fashion color naming gaps:

  seafoam / pistachio / mint / sage / celadon / aqua mint → green family
  khaki / beige / tan / sand / camel / taupe → neutral warm family
  ivory / cream / off-white / ecru / bone white → white family
  burgundy / wine / maroon / bordeaux / deep red → dark red family
  rust / terracotta / burnt orange / cognac → orange-red family
  blush / rose / mauve / dusty pink / powder pink → soft pink family
  navy / midnight blue / indigo / deep blue → dark blue family
  teal / duck blue / petrol / blue-green → teal family
  charcoal / slate / anthracite / dark gray → dark neutral family
  mustard / ochre / amber / golden yellow / honey → yellow family
  lavender / lilac / soft violet / pale purple → purple family
  chocolate / espresso / deep brown / cocoa → dark brown family

---

## HOW EACH FAILING CASE NOW RESOLVES

### Case 1 — "seafoam pullover men"

Stage 1: color.aliases = [seafoam, mint green, sage, celadon]
         exclude_types = [cardigan, button-up, zip-up]
         enriched_query = "mint green sage crew neck pullover sweater men knit"

Stage 2: CLIP encodes enriched query (mint green, not seafoam — better signal)
         SQL Path B finds products with mint/sage in color_aliases column

Stage 3: Cardigan removed by structural exclusion (buttons detected in garment_type)

Stage 4: Mint sweater gets +0.25 color boost
         Before: 0.53  After: 0.78 → Rank 1 ✓

---

### Case 2 — White coat uploaded + "something similar for women"

Stage 1 (image): Gemini sees coat → garment_type.family = outerwear
Stage 1 (text): gender = Women → hard filter

Stage 2: pgvector searches across all products
         Category soft boost (+0.20) applied to outerwear products
         SQL Path B filters for Women and Unisex gender only

Stage 3: Men's shirt → REMOVED by gender hard filter
         Men's vest → REMOVED by gender hard filter
         Cream sweater → survives but gets no category boost

Stage 4: White coats get +0.20 category boost + color boost if white/ivory match
         Corrupted black coat: has correct outerwear embedding, gets +0.20 category boost
         Rank: white coat 1, similar coats 2-3, corrupted black coat 4 ✓

The corrupted black coat surfaces because:
  1. Its combined_embedding was built from its coat image — never corrupted
  2. It is tagged as outerwear — category column never corrupted
  3. Category boost applies to it normally
  4. Its color_aliases does not contain "red" so no exclusion applies

---

### Case 3 — White coat + "similar but not red"

Stage 1: Gemini extracts exclude_colors = [red]

Stage 3 hard filter:
  Red coat → color column = "red", color_aliases contains "red" → REMOVED ✗
  Black coat (corrupted) → color_aliases contains no "red" → KEPT ✓
  White coat → KEPT ✓
  Beige coat → KEPT ✓

Red coat is removed regardless of its vector score. Negation works.

---

## SUMMARY OF ALL DESIGN DECISIONS

| Decision | Rationale |
|---|---|
| Gender is the only hard category filter | Avoids empty pages when exact matches don't exist |
| Price is a hard filter when stated | Budget is non-negotiable for customers |
| Category is a boost, not a wall | Better to show a blazer than nothing |
| Negation handled post-search, not in embedding | Embedding math cannot represent negation |
| Color handled as boost layer, not in embedding | Color has only 10% weight in combined vector |
| Gemini primary, Qwen fallback | Reliability without cost of always running both |
| CLIP for embeddings | Runs locally, zero API cost, consistent output |
| Supabase pgvector for search | Already in stack, handles 100-10000 products efficiently |
| search_tags replace prose in embedding input | Dense specific text gives CLIP better signal |
| color_aliases stored per product | Enables color synonym matching without query-time expansion alone |
| Agent context accumulates across turns | Prevents customers repeating constraints |
| Corrupted products get no special handling | Correct embedding and unchanged metadata surface them naturally |

---

*Search System Design v2.0*
*StyleSense Multimodal AI E-Commerce*
*Tech stack: Gemini + Qwen fallback, CLIP, Supabase pgvector*
