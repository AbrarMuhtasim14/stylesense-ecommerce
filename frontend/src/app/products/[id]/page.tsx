'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { getProduct, getSimilarProducts } from '@/lib/api';
import type { Product, ProductWithScore } from '@/lib/types';
import { formatPrice, getColorSwatch, getSizesForCategory, truncate } from '@/lib/utils';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/lib/cart-context';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { addItem, toggleDrawer } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [similar, setSimilar] = useState<ProductWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'details'>('description');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [prod, sim] = await Promise.all([
          getProduct(Number(id)),
          getSimilarProducts(Number(id), 8),
        ]);
        setProduct(prod);
        setSimilar(sim);
      } catch (err) {
        console.error('Failed to load product:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, selectedSize);
    setAddedFeedback(true);
    toggleDrawer(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, maxWidth: 1000, margin: '0 auto' }}>
          <div className="skeleton" style={{ aspectRatio: '3/4', borderRadius: 24 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
            <div className="skeleton" style={{ height: 36, width: '80%' }} />
            <div className="skeleton" style={{ height: 24, width: '30%' }} />
            <div className="skeleton" style={{ height: 80 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <div className="empty-state-icon">😕</div>
        <h2>Product not found</h2>
        <Link href="/products" className="btn btn-primary">Back to Catalog</Link>
      </div>
    );
  }

  const sizes = getSizesForCategory(product.category);
  const colorSwatch = getColorSwatch(product.color);

  return (
    <>
      <title>{product.title} | StyleSense</title>

      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Breadcrumb */}
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, fontSize: 13, color: '#a1a1aa' }}>
          <Link href="/" style={{ color: '#a1a1aa', textDecoration: 'none' }}>Home</Link>
          <span>/</span>
          <Link href="/products" style={{ color: '#a1a1aa', textDecoration: 'none' }}>Products</Link>
          <span>/</span>
          <Link
            href={`/products?category=${encodeURIComponent(product.category)}`}
            style={{ color: '#a1a1aa', textDecoration: 'none' }}
          >
            {product.category}
          </Link>
          <span>/</span>
          <span style={{ color: '#18181b', fontWeight: 500 }}>{truncate(product.title, 40)}</span>
        </nav>

        {/* Main grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 48,
            maxWidth: 1000,
            margin: '0 auto',
          }}
          className="product-detail-grid"
        >
          {/* Image panel */}
          <div>
            <div
              className="image-zoom-container"
              style={{
                aspectRatio: '3/4',
                background: '#f9fafb',
                position: 'relative',
              }}
            >
              {!imgError ? (
                <img
                  src={product.image_url}
                  alt={product.title}
                  onError={() => setImgError(true)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.5s ease',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 12,
                    color: '#a1a1aa',
                  }}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p style={{ fontSize: 14 }}>{product.category}</p>
                </div>
              )}

              {/* Badges */}
              <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {product.is_corrupted && (
                  <div
                    style={{
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: 100,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    ⚠️ Demo: Corrupted Metadata
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product info panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Category + gender */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span className="badge badge-brand">{product.category}</span>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 100,
                  background: '#f4f4f5',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#71717a',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {product.gender}
              </span>
              {product.season && (
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 100,
                    background: '#f4f4f5',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#71717a',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {product.season}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 style={{ fontSize: 28, fontWeight: 400, lineHeight: 1.2, marginBottom: 16, fontFamily: "'Inter', sans-serif" }}>
              {product.title}
            </h1>

            {/* Price */}
            <div style={{ marginBottom: 20 }}>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 500,
                  color: '#111',
                }}
              >
                {formatPrice(product.price)}
              </span>
              <span style={{ fontSize: 14, color: '#71717a', marginLeft: 10 }}>
                Incl. all taxes
              </span>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Color
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: colorSwatch,
                    border: '2px solid rgba(0,0,0,0.1)',
                    boxShadow: '0 0 0 2px white, 0 0 0 4px #d946ef',
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{product.color}</span>
              </div>
            </div>

            {/* Size selector */}
            {sizes.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Size
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 4,
                        border: '1px solid',
                        borderColor: selectedSize === size ? '#111' : '#e4e4e7',
                        background: selectedSize === size ? '#111' : 'white',
                        color: selectedSize === size ? 'white' : '#52525b',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 150ms',
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to cart */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <button
                onClick={handleAddToCart}
                className="btn btn-primary btn-lg"
                style={{ flex: 1, fontSize: 16 }}
              >
                {addedFeedback ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Added to Cart!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <path d="M16 10a4 4 0 0 1-8 0"/>
                    </svg>
                    Add to Cart
                  </>
                )}
              </button>

              <Link
                href={`/search?similar=${product.id}`}
                className="btn btn-outline btn-lg"
                style={{ whiteSpace: 'nowrap' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Find Similar
              </Link>
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1px solid #e4e4e7', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['description', 'details'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      borderBottom: `2px solid ${activeTab === tab ? '#111' : 'transparent'}`,
                      background: 'none',
                      fontSize: 14,
                      fontWeight: activeTab === tab ? 600 : 400,
                      color: activeTab === tab ? '#111' : '#71717a',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                      marginBottom: -1,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {tab === 'description' && 'Description'}
                    {tab === 'details' && 'Details'}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'description' && (
              <p style={{ fontSize: 15, color: '#52525b', lineHeight: 1.8 }}>
                {product.description || 'No description available.'}
              </p>
            )}



            {activeTab === 'details' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Category', value: product.category },
                  { label: 'Sub-category', value: product.sub_category || '—' },
                  { label: 'Color', value: product.color },
                  { label: 'Gender', value: product.gender },
                  { label: 'Season', value: product.season || '—' },
                  { label: 'Usage', value: product.usage_type || '—' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      padding: '10px 14px',
                      background: '#fafafa',
                      borderRadius: 10,
                      border: '1px solid #e4e4e7',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Similar products */}
        {similar.length > 0 && (
          <section style={{ marginTop: 72 }}>
            <h2 style={{ fontSize: 28, fontWeight: 400, marginBottom: 32, fontFamily: "'Inter', sans-serif" }}>Visually Similar</h2>
            <div className="product-grid">
              {similar.map((p, idx) => (
                <ProductCard key={p.id} product={p} showScore index={idx} />
              ))}
            </div>
          </section>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .product-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
