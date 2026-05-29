-- ============================================================
-- StyleSense Database Schema
-- Supabase PostgreSQL + pgvector
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    visual_description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT '৳',
    category TEXT NOT NULL,
    sub_category TEXT,
    color TEXT,
    gender TEXT CHECK (gender IN ('Men', 'Women', 'Unisex')),
    season TEXT,
    usage_type TEXT,
    image_url TEXT,
    is_corrupted BOOLEAN DEFAULT FALSE,
    original_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCT EMBEDDINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS product_embeddings (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    visual_embedding vector(512),
    text_embedding vector(512),
    combined_embedding vector(512),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id)
);

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    quantity INTEGER DEFAULT 1,
    total_price NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'shipped', 'delivered', 'cancelled')),
    shipping_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TICKETS TABLE (Agent State Machine)
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    customer_email TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('return', 'dispute', 'cancellation')),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'ELIGIBILITY_CHECK', 'INELIGIBLE', 'AWAITING_REASON', 'AWAITING_EVIDENCE', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUND_INITIATED', 'COMPLETED')),
    evidence_url TEXT,
    assigned_to TEXT,
    resolution TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Product filters
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_color ON products(color);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- Order lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

-- Vector indexes (HNSW for fast approximate nearest neighbor search)
-- These are created AFTER data is seeded for better index quality
-- Run these after seeding:
-- CREATE INDEX IF NOT EXISTS idx_embeddings_combined ON product_embeddings
--     USING hnsw (combined_embedding vector_cosine_ops);
-- CREATE INDEX IF NOT EXISTS idx_embeddings_visual ON product_embeddings
--     USING hnsw (visual_embedding vector_cosine_ops);

-- ============================================================
-- VECTOR SEARCH FUNCTION: match_products
-- Main search function used by all text and image queries
-- ============================================================
CREATE OR REPLACE FUNCTION match_products(
    query_embedding vector(512),
    match_threshold float DEFAULT 0.10,
    match_count int DEFAULT 20,
    filter_category text DEFAULT NULL,
    filter_gender text DEFAULT NULL,
    filter_color text DEFAULT NULL,
    filter_min_price numeric DEFAULT NULL,
    filter_max_price numeric DEFAULT NULL
)
RETURNS TABLE (
    id integer,
    title text,
    description text,
    visual_description text,
    price numeric,
    currency text,
    category text,
    sub_category text,
    color text,
    gender text,
    season text,
    usage_type text,
    image_url text,
    is_corrupted boolean,
    original_name text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.title,
        p.description,
        p.visual_description,
        p.price,
        p.currency,
        p.category,
        p.sub_category,
        p.color,
        p.gender,
        p.season,
        p.usage_type,
        p.image_url,
        p.is_corrupted,
        p.original_name,
        (1 - (pe.combined_embedding <=> query_embedding))::float AS similarity
    FROM products p
    JOIN product_embeddings pe ON p.id = pe.product_id
    WHERE p.is_active = true
        AND (1 - (pe.combined_embedding <=> query_embedding))::float > match_threshold
        AND (filter_category IS NULL OR p.category ILIKE filter_category)
        AND (filter_gender IS NULL OR p.gender ILIKE filter_gender)
        AND (filter_color IS NULL OR p.color ILIKE '%' || filter_color || '%')
        AND (filter_min_price IS NULL OR p.price >= filter_min_price)
        AND (filter_max_price IS NULL OR p.price <= filter_max_price)
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- VISUAL SIMILARITY FUNCTION: find_similar_products
-- Used by the "Find Visually Similar" feature on product detail
-- ============================================================
CREATE OR REPLACE FUNCTION find_similar_products(
    product_id_input integer,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id integer,
    title text,
    description text,
    price numeric,
    currency text,
    category text,
    color text,
    gender text,
    image_url text,
    similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
    source_embedding vector(512);
BEGIN
    -- Get the source product's visual embedding
    SELECT pe.visual_embedding INTO source_embedding
    FROM product_embeddings pe
    WHERE pe.product_id = product_id_input;

    IF source_embedding IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.title,
        p.description,
        p.price,
        p.currency,
        p.category,
        p.color,
        p.gender,
        p.image_url,
        (1 - (pe.visual_embedding <=> source_embedding))::float AS similarity
    FROM product_embeddings pe
    JOIN products p ON p.id = pe.product_id
    WHERE pe.product_id != product_id_input
        AND p.is_active = true
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS categories_updated_at ON categories;
CREATE TRIGGER categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- POST-SEED: Run these AFTER data is loaded
-- ============================================================
-- CREATE INDEX IF NOT EXISTS idx_embeddings_combined ON product_embeddings
--     USING hnsw (combined_embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
-- CREATE INDEX IF NOT EXISTS idx_embeddings_visual ON product_embeddings
--     USING hnsw (visual_embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);

-- ============================================================
-- POLICY EMBEDDINGS TABLE (RAG for company policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS policy_embeddings (
    id SERIAL PRIMARY KEY,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POLICY VECTOR SEARCH FUNCTION: match_policy_chunks
-- ============================================================
CREATE OR REPLACE FUNCTION match_policy_chunks(
    query_embedding vector(768),
    match_count int DEFAULT 3,
    match_threshold float DEFAULT 0.30
)
RETURNS TABLE (
    id integer,
    chunk_index integer,
    content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pe.id,
        pe.chunk_index,
        pe.content,
        (1 - (pe.embedding <=> query_embedding))::float AS similarity
    FROM policy_embeddings pe
    WHERE (1 - (pe.embedding <=> query_embedding))::float > match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;
