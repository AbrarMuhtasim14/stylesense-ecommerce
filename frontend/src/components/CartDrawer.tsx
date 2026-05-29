'use client';

import { useCart } from '@/lib/cart-context';
import { formatPrice } from '@/lib/utils';

export default function CartDrawer() {
  const { state, removeItem, updateQty, clearCart, toggleDrawer, total } = useCart();
  const { isOpen, items } = state;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="overlay"
        onClick={() => toggleDrawer(false)}
        style={{ zIndex: 60 }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 420,
          background: 'white',
          zIndex: 70,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Your Cart</h2>
            <p style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>
              {items.length === 0 ? 'No items yet' : `${items.reduce((s, i) => s + i.quantity, 0)} items`}
            </p>
          </div>
          <button
            onClick={() => toggleDrawer(false)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1.5px solid #e4e4e7',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: '60px 0' }}>
              <div className="empty-state-icon">🛍️</div>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Your cart is empty</h3>
              <p style={{ fontSize: 14, color: '#71717a' }}>
                Find something you love and add it here
              </p>
              <button
                onClick={() => toggleDrawer(false)}
                className="btn btn-primary"
                style={{ marginTop: 8 }}
              >
                Browse Products
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {items.map((item) => (
                <div
                  key={`${item.product.id}-${item.size}`}
                  style={{
                    display: 'flex',
                    gap: 14,
                    padding: 14,
                    background: '#fafafa',
                    borderRadius: 14,
                    border: '1px solid #e4e4e7',
                  }}
                >
                  {/* Image */}
                  <div
                    style={{
                      width: 70,
                      height: 90,
                      borderRadius: 10,
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: '#f4f4f5',
                    }}
                  >
                    <img
                      src={item.product.image_url}
                      alt={item.product.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#18181b',
                        lineHeight: 1.4,
                        marginBottom: 4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.product.title}
                    </p>
                    {item.size && (
                      <p style={{ fontSize: 12, color: '#71717a', marginBottom: 6 }}>
                        Size: {item.size}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        marginBottom: 10,
                      }}
                    >
                      {formatPrice(item.product.price * item.quantity)}
                    </p>

                    {/* Quantity + remove */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1.5px solid #e4e4e7',
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity - 1)}
                          style={{
                            width: 30,
                            height: 30,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: '#52525b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          −
                        </button>
                        <span style={{ width: 32, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity + 1)}
                          style={{
                            width: 30,
                            height: 30,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: '#52525b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.product.id)}
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: '#ef4444',
                          fontWeight: 500,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid #e4e4e7' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 14, color: '#52525b' }}>Subtotal</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{formatPrice(total)}</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
              onClick={() => {
                toggleDrawer(false);
                window.location.href = '/checkout';
              }}
            >
              Proceed to Checkout
            </button>
            <button
              onClick={clearCart}
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', marginTop: 8, color: '#a1a1aa' }}
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
