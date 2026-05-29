'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { ProductWithScore, Product } from '@/lib/types';
import { formatPrice, formatScore, getColorSwatch, truncate } from '@/lib/utils';
import { useCart } from '@/lib/cart-context';

interface ProductCardProps {
  product: ProductWithScore | Product;
  showScore?: boolean;
  index?: number;
}

export default function ProductCard({ product, showScore = false, index = 0 }: ProductCardProps) {
  const { addItem, toggleDrawer } = useCart();
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [imgError, setImgError] = useState(false);

  const withScore = 'similarity_score' in product ? product as ProductWithScore : null;
  const score = withScore?.similarity_score ?? 0;
  const isVisionMatch = withScore?.is_vision_match ?? false;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product as Product);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1800);
  };

  const colorSwatch = getColorSwatch(product.color);
  const isGradient = colorSwatch.startsWith('linear');

  return (
    <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article
        className="product-card animate-fade-in-up"
        style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both', opacity: 0 }}
      >
        {/* Image */}
        <div className="product-card-image">
          {imgError ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 8,
                color: '#a1a1aa',
                background: '#f9fafb',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span style={{ fontSize: 12 }}>{product.category}</span>
            </div>
          ) : (
            <img
              src={product.image_url}
              alt={product.title}
              loading="lazy"
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Overlay badges */}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {isVisionMatch && (
              <span className="ai-vision-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                AI Vision
              </span>
            )}
            {product.is_corrupted && (
              <span
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 100,
                  border: '1px solid #fde68a',
                }}
              >
                ⚠ Demo
              </span>
            )}
          </div>

          {/* Quick add button */}
          <button
            onClick={handleAddToCart}
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: addedFeedback
                ? '#22c55e'
                : 'linear-gradient(135deg, #d946ef, #9333ea)',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              opacity: 0,
              transform: 'translateY(4px)',
              transition: 'all 200ms ease',
            }}
            className="product-card-add-btn"
          >
            {addedFeedback ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
          </button>

          {/* Score badge */}
          {showScore && score > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 100,
              }}
            >
              {formatScore(score)} match
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '14px 16px 16px' }}>
          {/* Category + color */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {product.category}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: isGradient ? colorSwatch : colorSwatch,
                  border: '1.5px solid rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>{product.color}</span>
            </div>
          </div>

          {/* Title */}
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#18181b',
              lineHeight: 1.4,
              marginBottom: 10,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {truncate(product.title, 60)}
          </h3>

          {/* Price + gender */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {formatPrice(product.price)}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#71717a',
                background: '#f4f4f5',
                padding: '2px 8px',
                borderRadius: 100,
              }}
            >
              {product.gender}
            </span>
          </div>

          {/* Score bar if showing */}
          {showScore && score > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width: `${score * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </article>

      <style>{`
        .product-card:hover .product-card-add-btn {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
      `}</style>
    </Link>
  );
}
