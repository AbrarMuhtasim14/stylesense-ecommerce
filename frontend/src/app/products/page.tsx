'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Product, Category } from '@/lib/types';
import { getProducts, getCategories } from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import { getColorSwatch } from '@/lib/utils';

const GENDERS = ['Men', 'Women', 'Unisex', 'Boys', 'Girls'];
const COLORS = ['Black', 'White', 'Blue', 'Red', 'Green', 'Yellow', 'Grey', 'Brown', 'Navy', 'Pink', 'Beige', 'Orange'];
const SORT_OPTIONS = [
  { value: 'default', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A–Z' },
];
const PAGE_SIZE = 20;

import { Suspense } from 'react';

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('default');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters (from URL or state)
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedGender, setSelectedGender] = useState(searchParams.get('gender') || '');
  const [selectedColor, setSelectedColor] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const results = await getProducts({
        category: selectedCategory || undefined,
        gender: selectedGender || undefined,
        color: selectedColor || undefined,
        min_price: priceRange[0] > 0 ? priceRange[0] : undefined,
        max_price: priceRange[1] < 10000 ? priceRange[1] : undefined,
        limit: 200, // Get all, sort client-side for demo
        offset: 0,
      });

      // Sort
      let sorted = [...results];
      if (sort === 'price_asc') sorted.sort((a, b) => a.price - b.price);
      else if (sort === 'price_desc') sorted.sort((a, b) => b.price - a.price);
      else if (sort === 'name_asc') sorted.sort((a, b) => a.title.localeCompare(b.title));

      setTotal(sorted.length);
      setProducts(sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedGender, selectedColor, priceRange, sort, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const clearFilters = () => {
    setSelectedCategory('');
    setSelectedGender('');
    setSelectedColor('');
    setPriceRange([0, 10000]);
    setPage(0);
  };

  const hasFilters = selectedCategory || selectedGender || selectedColor || priceRange[0] > 0 || priceRange[1] < 10000;

  const FilterSidebar = () => (
    <aside style={{ minWidth: 240, maxWidth: 240 }} className="sidebar-scroll">
      {/* Category */}
      <div className="sidebar-section">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Category
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            onClick={() => { setSelectedCategory(''); setPage(0); }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: !selectedCategory ? 'linear-gradient(135deg, #d946ef, #9333ea)' : 'transparent',
              color: !selectedCategory ? 'white' : '#52525b',
              fontWeight: !selectedCategory ? 600 : 500,
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 14,
              transition: 'all 150ms',
            }}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => { setSelectedCategory(cat.name); setPage(0); }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: selectedCategory === cat.name ? 'linear-gradient(135deg, #d946ef, #9333ea)' : 'transparent',
                color: selectedCategory === cat.name ? 'white' : '#52525b',
                fontWeight: selectedCategory === cat.name ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                transition: 'all 150ms',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                if (selectedCategory !== cat.name) {
                  e.currentTarget.style.background = '#f4f4f5';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCategory !== cat.name) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span>{cat.name}</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Gender */}
      <div className="sidebar-section">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Gender
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GENDERS.map((g) => (
            <button
              key={g}
              onClick={() => { setSelectedGender(selectedGender === g ? '' : g); setPage(0); }}
              style={{
                padding: '6px 14px',
                borderRadius: 100,
                border: '1.5px solid',
                borderColor: selectedGender === g ? '#d946ef' : '#e4e4e7',
                background: selectedGender === g ? 'linear-gradient(135deg, #d946ef, #9333ea)' : 'white',
                color: selectedGender === g ? 'white' : '#52525b',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="sidebar-section">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Color
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COLORS.map((color) => {
            const swatch = getColorSwatch(color);
            const isSelected = selectedColor === color;
            return (
              <button
                key={color}
                onClick={() => { setSelectedColor(isSelected ? '' : color); setPage(0); }}
                title={color}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: swatch.startsWith('linear') ? swatch : swatch,
                  border: isSelected ? '3px solid #d946ef' : '2px solid rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                  boxShadow: isSelected ? '0 0 0 2px white, 0 0 0 4px #d946ef' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Price range */}
      <div className="sidebar-section">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Price Range
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            value={priceRange[0]}
            onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
            placeholder="Min"
            style={{
              width: 80,
              padding: '6px 10px',
              border: '1.5px solid #e4e4e7',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <span style={{ color: '#a1a1aa' }}>—</span>
          <input
            type="number"
            value={priceRange[1]}
            onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
            placeholder="Max"
            style={{
              width: 80,
              padding: '6px 10px',
              border: '1.5px solid #e4e4e7',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 12, color: '#a1a1aa' }}>৳</span>
        </div>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button onClick={clearFilters} className="btn btn-outline" style={{ width: '100%' }}>
          Clear All Filters
        </button>
      )}
    </aside>
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <title>Product Catalog | StyleSense</title>
      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800 }}>
              {selectedCategory || 'All Products'}
            </h1>
            <p style={{ color: '#71717a', marginTop: 4 }}>
              {loading ? 'Loading…' : `${total} products`}
              {hasFilters && <span style={{ color: '#d946ef', marginLeft: 8 }}>• Filters active</span>}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Mobile filter toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="11" y2="6"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="13" y2="18"/>
              </svg>
              Filters
            </button>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(0); }}
              style={{
                padding: '8px 14px',
                border: '1.5px solid #e4e4e7',
                borderRadius: 10,
                fontSize: 14,
                outline: 'none',
                background: 'white',
                cursor: 'pointer',
                color: '#18181b',
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {selectedCategory && (
              <span className="filter-chip active">
                {selectedCategory}
                <button onClick={() => setSelectedCategory('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            )}
            {selectedGender && (
              <span className="filter-chip active">
                {selectedGender}
                <button onClick={() => setSelectedGender('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            )}
            {selectedColor && (
              <span className="filter-chip active">
                {selectedColor}
                <button onClick={() => setSelectedColor('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            )}
          </div>
        )}

        {/* Layout: sidebar + grid */}
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
          {/* Sidebar - desktop always visible, mobile conditional */}
          <div
            style={{
              display: sidebarOpen ? 'block' : 'none',
              flexShrink: 0,
            }}
            className="sidebar-desktop-visible"
          >
            <FilterSidebar />
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div className="product-grid">
                {[...Array(8)].map((_, i) => (
                  <div key={i} style={{ borderRadius: 20, overflow: 'hidden' }}>
                    <div className="skeleton" style={{ height: 280 }} />
                    <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="skeleton" style={{ height: 12, width: '60%' }} />
                      <div className="skeleton" style={{ height: 16 }} />
                      <div className="skeleton" style={{ height: 12, width: '40%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3 style={{ fontSize: 20, fontWeight: 700 }}>No products found</h3>
                <p style={{ color: '#71717a' }}>Try adjusting your filters</p>
                <button onClick={clearFilters} className="btn btn-primary">Clear Filters</button>
              </div>
            ) : (
              <>
                <div className="product-grid">
                  {products.map((product, idx) => (
                    <ProductCard key={product.id} product={product} index={idx} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 40 }}>
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="btn btn-secondary"
                    >
                      ← Previous
                    </button>
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          border: '1.5px solid',
                          borderColor: page === i ? 'transparent' : '#e4e4e7',
                          background: page === i ? 'linear-gradient(135deg, #d946ef, #9333ea)' : 'white',
                          color: page === i ? 'white' : '#52525b',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="btn btn-secondary"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .sidebar-desktop-visible {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div>Loading products...</div>}>
      <ProductsPageContent />
    </Suspense>
  );
}
