'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Product, Category } from '@/lib/types';
import { getProducts, getCategories } from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import { getCategoryIcon, formatPrice } from '@/lib/utils';

// ──────────────────────────────────────────────
// HERO SECTION (Luxury Minimalist Redesign)
// ──────────────────────────────────────────────
function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'text' && query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else if (mode === 'image' && imageFile) {
      const reader = new FileReader();
      reader.onload = () => {
        sessionStorage.setItem('searchImage', reader.result as string);
        sessionStorage.setItem('searchImageName', imageFile.name);
        sessionStorage.setItem('searchTextQuery', query);
        router.push('/search?mode=image');
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setMode('image');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setMode('image');
    }
  };

  return (
    <section
      style={{
        position: 'relative',
        height: '80vh',
        minHeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f4f4', // Minimal luxury gray
        overflow: 'hidden',
      }}
    >
      {/* Editorial Background Image Placeholder (Subtle & High End) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'url("https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=2070&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.85,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.5))',
        }}
      />

      <div className="container" style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(40px, 8vw, 80px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: '#fff',
            marginBottom: 40,
            fontFamily: "'Inter', sans-serif",
            animation: 'fadeInUp 0.8s ease-out',
          }}
        >
          Curated For You
        </h1>

        <div style={{ maxWidth: 640, margin: '0 auto', animation: 'fadeInUp 1s ease-out' }}>
          <form
            onSubmit={handleSearch}
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              padding: 6,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {mode === 'image' && imageFile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0 4px 12px',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '2px solid #d946ef',
                  flexShrink: 0,
                }}>
                  <img
                    src={URL.createObjectURL(imageFile)}
                    alt="Search image"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setMode('text'); }}
                  title="Remove image"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 16,
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === 'image' ? 'Add text instructions (e.g. "similar but not red")...' : 'Describe in plain language what you want, or upload an image.'}
              style={{
                flex: 1,
                padding: '16px 20px',
                border: 'none',
                background: 'transparent',
                fontSize: 16,
                color: '#000',
                outline: 'none',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload an image"
              style={{
                padding: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <button
              type="submit"
              disabled={mode === 'text' ? !query.trim() : !imageFile}
              style={{
                padding: '14px 32px',
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: 2,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Search
            </button>
          </form>
          <div style={{ marginTop: 16, color: '#fff', fontSize: 13, letterSpacing: '0.05em', opacity: 0.9 }}>
            Our e-commerce has eyes. ✨
          </div>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// CATEGORY GRID
// ──────────────────────────────────────────────
function CategoryGrid({ categories }: { categories: Category[] }) {
  const router = useRouter();

  return (
    <section className="section" style={{ background: 'white' }}>
      <div className="container">
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Shop by Category</h2>
          <p style={{ color: '#71717a', fontSize: 16 }}>
            Explore {categories.length} curated categories
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 16,
          }}
        >
          {categories.slice(0, 10).map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => router.push(`/products?category=${encodeURIComponent(cat.name)}`)}
              className="animate-fade-in-up"
              style={{
                padding: '20px 16px',
                background: 'white',
                border: '1.5px solid #e4e4e7',
                borderRadius: 16,
                cursor: 'pointer',
                transition: 'all 200ms',
                textAlign: 'center',
                animationDelay: `${idx * 50}ms`,
                animationFillMode: 'both',
                opacity: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#d946ef';
                e.currentTarget.style.background = '#fdf4ff';
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(217,70,239,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e4e4e7';
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>{getCategoryIcon(cat.name)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginBottom: 4 }}>
                {cat.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#a1a1aa',
                  background: '#f4f4f5',
                  padding: '2px 8px',
                  borderRadius: 100,
                  display: 'inline-block',
                }}
              >
                {cat.count} items
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// HOW IT WORKS
// ──────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      icon: '🖼️',
      title: 'Image as Truth',
      desc: 'Every product image is analyzed by CLIP to generate a 512-dimensional visual embedding that captures exact colors, textures, and silhouettes.',
    },
    {
      icon: '🔤',
      title: '60/40 Weighting',
      desc: 'Search embeddings combine 60% visual signal with 40% text signal. Visual appearance always dominates over product labels.',
    },
    {
      icon: '🔍',
      title: 'pgvector Similarity',
      desc: 'Queries are encoded by CLIP and matched against stored embeddings using cosine similarity in PostgreSQL — no external vector DB needed.',
    },
    {
      icon: '✨',
      title: 'AI Vision Match',
      desc: 'When visual similarity far exceeds text match, the AI Vision badge appears — proving the system finds products from their images, not just their titles.',
    },
  ];

  return (
    <section className="section" style={{ background: '#fafafa' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              background: 'rgba(217,70,239,0.08)',
              border: '1px solid rgba(217,70,239,0.2)',
              borderRadius: 100,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: '#9333ea' }}>
              The Technology Behind StyleSense
            </span>
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>How the AI Works</h2>
          <p style={{ color: '#71717a', fontSize: 16 }}>
            A multimodal pipeline where the image is always the source of truth
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 24,
          }}
        >
          {steps.map((step, idx) => (
            <div
              key={step.title}
              className="animate-fade-in-up"
              style={{
                padding: 28,
                background: 'white',
                borderRadius: 20,
                border: '1.5px solid #e4e4e7',
                position: 'relative',
                animationDelay: `${idx * 80}ms`,
                animationFillMode: 'both',
                opacity: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {idx + 1}
              </div>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{step.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: '#71717a', lineHeight: 1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Demo callout */}
        <div
          style={{
            marginTop: 40,
            padding: 28,
            background: 'linear-gradient(135deg, rgba(217,70,239,0.06), rgba(99,102,241,0.06))',
            border: '1.5px solid rgba(217,70,239,0.15)',
            borderRadius: 20,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: '#18181b', marginBottom: 8 }}>
            🔥 Try the Demo
          </p>
          <p style={{ fontSize: 14, color: '#71717a', marginBottom: 20, lineHeight: 1.6 }}>
            Some products in our catalog have intentionally corrupted titles — the wrong name for the wrong product.
            Search for what the product <em>looks like</em>, and StyleSense will still find it correctly.
          </p>
          <Link
            href="/search?q=mint green waffle knit sweater"
            className="btn btn-primary"
          >
            Try: "mint green waffle knit sweater"
          </Link>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// FEATURED PRODUCTS
// ──────────────────────────────────────────────
function FeaturedProducts({ products }: { products: Product[] }) {
  return (
    <section className="section" style={{ background: 'white' }}>
      <div className="container">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 36, fontWeight: 400, marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>Featured Products</h2>
            <p style={{ color: '#71717a', fontSize: 16 }}>Curated from our AI-powered catalog</p>
          </div>
          <Link
            href="/products"
            className="btn btn-outline"
          >
            View All
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>

        <div className="product-grid">
          {products.map((product, idx) => (
            <ProductCard key={product.id} product={product} index={idx} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// MAIN PAGE
// ──────────────────────────────────────────────
export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, cats] = await Promise.all([
          getProducts({ limit: 8 }),
          getCategories(),
        ]);
        setProducts(prods);
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load homepage data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <>
      <HeroSection />
      <CategoryGrid categories={categories} />
      {loading ? (
        <section className="section" style={{ background: 'white' }}>
          <div className="container">
            <h2 style={{ fontSize: 36, fontWeight: 400, marginBottom: 32, fontFamily: "'Inter', sans-serif" }}>Featured Products</h2>
            <div className="product-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ borderRadius: 20, overflow: 'hidden' }}>
                  <div className="skeleton" style={{ height: 280 }} />
                  <div style={{ padding: '14px 0' }}>
                    <div className="skeleton" style={{ height: 14, marginBottom: 8, width: '60%' }} />
                    <div className="skeleton" style={{ height: 18, marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 14, width: '40%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <FeaturedProducts products={products} />
      )}
    </>
  );
}
