'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid #e4e4e7',
        background: '#fafafa',
        padding: '48px 0 32px',
        marginTop: 'auto',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 40,
            marginBottom: 48,
          }}
        >
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: 'white',
                }}
              >
                ✦
              </div>
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 800,
                  fontSize: 18,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                StyleSense
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6, maxWidth: 200 }}>
              AI-powered fashion search. Find what you mean, not just what you type.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Shop
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['All Products', 'Men', 'Women', 'Accessories', 'New Arrivals'].map((item) => (
                <li key={item}>
                  <Link
                    href={`/products?gender=${item === 'Men' ? 'Men' : item === 'Women' ? 'Women' : ''}`}
                    style={{ fontSize: 14, color: '#71717a', textDecoration: 'none', transition: 'color 150ms' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#d946ef')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#71717a')}
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Features
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'AI Text Search', href: '/search' },
                { label: 'Image Search', href: '/search?mode=image' },
                { label: 'Style Assistant', href: '/' },
                { label: 'Admin Portal', href: '/admin' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    style={{ fontSize: 14, color: '#71717a', textDecoration: 'none', transition: 'color 150ms' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#d946ef')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#71717a')}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Tech */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#18181b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Powered By
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'CLIP ViT-B/32', sub: 'Visual embeddings' },
                { label: 'Gemini 2.5 Flash', sub: 'Vision & chat AI' },
                { label: 'pgvector', sub: 'Vector similarity search' },
                { label: 'Supabase', sub: 'Database & storage' },
              ].map((tech) => (
                <div key={tech.label}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3f3f46' }}>{tech.label}</div>
                  <div style={{ fontSize: 12, color: '#a1a1aa' }}>{tech.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            borderTop: '1px solid #e4e4e7',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: '#a1a1aa' }}>
            © 2025 StyleSense. Multimodal AI E-Commerce Demo.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                background: '#f4f4f5',
                borderRadius: 100,
                fontSize: 12,
                color: '#71717a',
                fontWeight: 500,
              }}
            >
              <span style={{ color: '#22c55e' }}>●</span>
              AI Search Active
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
