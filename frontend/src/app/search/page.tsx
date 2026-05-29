'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { ProductWithScore } from '@/lib/types';
import { searchByText, searchByImage, getSimilarProducts } from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import { formatScore } from '@/lib/utils';

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryParam = searchParams.get('q') || '';
  const modeParam = searchParams.get('mode') || 'text';
  const similarParam = searchParams.get('similar');

  const [results, setResults] = useState<ProductWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'combined'>('text');
  const [inputQuery, setInputQuery] = useState(queryParam);
  const [activeMode, setActiveMode] = useState<'text' | 'image'>(modeParam === 'image' ? 'image' : 'text');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(queryParam);
  const [visionMatchCount, setVisionMatchCount] = useState(0);

  const doTextSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setCurrentQuery(q);
    try {
      const res = await searchByText(q, { limit: 20 });
      setResults(res.results);
      setSearchType(res.search_type);
      setVisionMatchCount(res.results.filter((r) => r.is_vision_match).length);
    } catch (err) {
      setError('Search failed. Make sure the backend server is running on port 7860.');
    } finally {
      setLoading(false);
    }
  }, []);

  const doImageSearch = useCallback(async (file: File, text?: string) => {
    setLoading(true);
    setError(null);
    setCurrentQuery(text || 'Image Search');
    try {
      const res = await searchByImage(file, text || undefined, { limit: 20 });
      setResults(res.results);
      setSearchType(res.search_type);
      setVisionMatchCount(res.results.filter((r) => r.is_vision_match).length);
    } catch (err) {
      setError('Image search failed. Make sure the backend server is running on port 7860.');
    } finally {
      setLoading(false);
    }
  }, []);

  const doSimilarSearch = useCallback(async (productId: number) => {
    setLoading(true);
    setError(null);
    setCurrentQuery(`Similar to product #${productId}`);
    setSearchType('combined');
    try {
      const sim = await getSimilarProducts(productId, 20);
      setResults(sim);
      setVisionMatchCount(sim.filter((r) => r.is_vision_match).length);
    } catch (err) {
      setError('Failed to find similar products.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial search from URL params
  useEffect(() => {
    if (similarParam) {
      doSimilarSearch(Number(similarParam));
    } else if (queryParam && modeParam !== 'image') {
      doTextSearch(queryParam);
    } else if (modeParam === 'image') {
      // Load stored image from sessionStorage
      const storedImg = sessionStorage.getItem('searchImage');
      const storedName = sessionStorage.getItem('searchImageName');
      const storedText = sessionStorage.getItem('searchTextQuery');
      if (storedImg && storedName) {
        fetch(storedImg)
          .then((r) => r.blob())
          .then((blob) => {
            const file = new File([blob], storedName, { type: blob.type });
            setImageFile(file);
            setImagePreview(storedImg);
            setActiveMode('image');
            doImageSearch(file, storedText || undefined);
          })
          .catch(() => {});
      }
    }
  }, [queryParam, modeParam, similarParam, doTextSearch, doImageSearch, doSimilarSearch]);

  const handleTextSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(inputQuery.trim())}`);
      doTextSearch(inputQuery.trim());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleImageSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (imageFile) {
      doImageSearch(imageFile, inputQuery || undefined);
    }
  };

  const searchTypeLabels = {
    text: 'Text Semantic Search',
    image: 'Image Visual Search',
    combined: 'Combined Search',
  };

  return (
    <>
      <title>
        {currentQuery ? `"${currentQuery}" — Search | StyleSense` : 'Search | StyleSense'}
      </title>

      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>AI-Powered Search</h1>
          <p style={{ color: '#71717a' }}>
            Find products by describing what you want, or uploading a photo. CLIP understands visual semantics.
          </p>
        </div>

        {/* Search form */}
        <div
          style={{
            background: 'white',
            border: '1.5px solid #e4e4e7',
            borderRadius: 20,
            padding: 24,
            marginBottom: 32,
          }}
        >
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['text', 'image'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setActiveMode(m)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 100,
                  border: '2px solid',
                  borderColor: activeMode === m ? '#d946ef' : '#e4e4e7',
                  background: activeMode === m ? 'linear-gradient(135deg, #d946ef, #9333ea)' : 'white',
                  color: activeMode === m ? 'white' : '#52525b',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {m === 'text' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    Text Search
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Image Search
                  </>
                )}
              </button>
            ))}
          </div>

          {activeMode === 'text' ? (
            <form onSubmit={handleTextSearch} style={{ display: 'flex', gap: 12 }}>
              <input
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Try: mint green waffle knit sweater, leather boots, floral sundress..."
                className="input"
                style={{ flex: 1, fontSize: 15, padding: '14px 18px' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '14px 28px', fontSize: 15, borderRadius: 12 }}
                disabled={!inputQuery.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Search
              </button>
            </form>
          ) : (
            <form onSubmit={handleImageSearch}>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !imageFile && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#d946ef' : imageFile ? '#22c55e' : '#e4e4e7'}`,
                  borderRadius: 16,
                  padding: imageFile ? 16 : 36,
                  background: isDragging ? '#fdf4ff' : imageFile ? '#f0fdf4' : '#fafafa',
                  cursor: imageFile ? 'default' : 'pointer',
                  transition: 'all 200ms',
                  marginBottom: 12,
                  textAlign: imageFile ? 'left' : 'center',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {imageFile && imagePreview ? (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '2px solid #22c55e',
                      }}
                    >
                      <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, marginBottom: 4 }}>{imageFile.name}</p>
                      <p style={{ fontSize: 13, color: '#71717a' }}>
                        Image ready. Optionally add a text constraint below.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                      className="btn btn-secondary btn-sm"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>Drop an image or click to upload</p>
                    <p style={{ fontSize: 13, color: '#71717a' }}>Supports JPG, PNG, WebP</p>
                  </div>
                )}
              </div>

              {/* Optional text constraint */}
              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Optional: add a text constraint (e.g. 'but red', 'casual style')"
                  className="input"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!imageFile}
                  style={{ padding: '12px 24px', borderRadius: 12 }}
                >
                  Search
                </button>
              </div>
            </form>
          )}

          {/* Quick demos */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#a1a1aa', alignSelf: 'center' }}>Demo queries:</span>
            {[
              'mint green waffle knit sweater',
              'navy blue casual chinos',
              'leather crossbody bag',
              'floral summer dress',
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setActiveMode('text');
                  setInputQuery(q);
                  router.push(`/search?q=${encodeURIComponent(q)}`);
                  doTextSearch(q);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 100,
                  border: '1.5px solid #e4e4e7',
                  background: 'white',
                  fontSize: 12,
                  color: '#52525b',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d946ef';
                  e.currentTarget.style.color = '#9333ea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e4e4e7';
                  e.currentTarget.style.color = '#52525b';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: '2px solid #e4e4e7',
                  borderTopColor: '#d946ef',
                  animation: 'spin-slow 0.7s linear infinite',
                }}
              />
              <span style={{ fontSize: 15, color: '#71717a' }}>AI searching through visual embeddings...</span>
            </div>
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
          </div>
        ) : error ? (
          <div
            style={{
              padding: 24,
              background: '#fee2e2',
              borderRadius: 16,
              border: '1px solid #fecaca',
              color: '#991b1b',
              lineHeight: 1.6,
            }}
          >
            <strong>⚠️ Error:</strong> {error}
          </div>
        ) : results.length > 0 ? (
          <div>
            {/* Results header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                  {results.length} results
                  {currentQuery && (
                    <span style={{ fontWeight: 400, color: '#71717a' }}>
                      {' '}for{' '}
                      <span style={{ color: '#d946ef', fontWeight: 600 }}>"{currentQuery}"</span>
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '3px 12px',
                      background: '#f4f4f5',
                      borderRadius: 100,
                      fontSize: 12,
                      color: '#71717a',
                      fontWeight: 500,
                    }}
                  >
                    {searchTypeLabels[searchType]}
                  </span>
                  {visionMatchCount > 0 && (
                    <span className="ai-vision-badge">
                      {visionMatchCount} AI Vision Match{visionMatchCount > 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Vision Match explanation banner */}
            {visionMatchCount > 0 && (
              <div
                style={{
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(217,70,239,0.06), rgba(99,102,241,0.06))',
                  border: '1.5px solid rgba(217,70,239,0.2)',
                  borderRadius: 14,
                  marginBottom: 24,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 24, flexShrink: 0 }}>🔍</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#6d28d9', marginBottom: 4 }}>
                    AI Vision Match Detected
                  </p>
                  <p style={{ fontSize: 13, color: '#52525b', lineHeight: 1.6 }}>
                    {visionMatchCount} product{visionMatchCount > 1 ? 's' : ''} ranked highly because{' '}
                    their <strong>visual embedding</strong> (from the actual image) matches your query,
                    even though their text metadata may not. This is StyleSense's core capability —
                    the image is always truth.
                  </p>
                </div>
              </div>
            )}

            <div className="product-grid">
              {results.map((product, idx) => (
                <ProductCard key={product.id} product={product} showScore index={idx} />
              ))}
            </div>
          </div>
        ) : currentQuery ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3 style={{ fontSize: 20, fontWeight: 700 }}>No results found</h3>
            <p style={{ color: '#71717a' }}>
              Try different keywords, or use the image search to find by visual similarity
            </p>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin-slow { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ padding: '32px 24px' }}>
        <div className="skeleton" style={{ height: 40, width: '40%', marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 120, marginBottom: 32, borderRadius: 20 }} />
      </div>
    }>
      <SearchPageInner />
    </Suspense>
  );
}
