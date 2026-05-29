'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart-context';
import { createOrder } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';

export default function CheckoutPage() {
  const { state, total, clearCart } = useCart();
  const { items } = state;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    order_number: string;
    total_price: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState('');

  // Pre-fill name and email from active user session if present
  useEffect(() => {
    Promise.resolve().then(() => {
      const user = getCurrentUser();
      if (user) {
        if (user.name) setName(user.name);
        if (user.email) setEmail(user.email);
      }
    });
  }, []);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !address.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    setError('');
    setIsProcessing(true);

    // Simulate payment processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const result = await createOrder({
        customer_name: name.trim(),
        customer_email: email.trim(),
        shipping_address: address.trim(),
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          size: item.size,
        })),
      });

      setOrderResult(result);
      clearCart();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
      setError(errMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Success state
  if (orderResult) {
    return (
      <>
        <title>Order Confirmed | StyleSense</title>
        <div className="container" style={{ padding: '60px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 36,
            }}
          >
            ✓
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Order Confirmed!</h1>
          <p style={{ color: '#71717a', fontSize: 15, marginBottom: 24 }}>{orderResult.message}</p>

          <div
            style={{
              background: '#fafafa',
              borderRadius: 16,
              padding: '24px',
              border: '1px solid #e4e4e7',
              marginBottom: 32,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#71717a', fontSize: 14 }}>Order Number</span>
              <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{orderResult.order_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#71717a', fontSize: 14 }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{formatPrice(orderResult.total_price)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#71717a', fontSize: 14 }}>Status</span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 100,
                  background: '#fef3c7',
                  color: '#92400e',
                }}
              >
                Processing
              </span>
            </div>
          </div>

          <p style={{ color: '#71717a', fontSize: 13, marginBottom: 24 }}>
            Save your order number <strong>{orderResult.order_number}</strong> and email to check status or request returns via the Style Assistant chat.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href="/" className="btn btn-primary" style={{ padding: '12px 28px' }}>
              Continue Shopping
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <title>Checkout | StyleSense</title>
      <div className="container" style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 32 }}>Checkout</h1>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 0' }}>
            <div className="empty-state-icon">🛒</div>
            <h3 style={{ fontSize: 20, fontWeight: 700 }}>Your cart is empty</h3>
            <p style={{ color: '#71717a' }}>Add some items before checking out.</p>
            <Link href="/products" className="btn btn-primary" style={{ marginTop: 12 }}>
              Browse Products
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'flex-start' }}>
            {/* Left: Form */}
            <form onSubmit={handleCheckout}>
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: '1px solid #e4e4e7',
                  padding: 28,
                  marginBottom: 24,
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Delivery Details</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52525b', marginBottom: 6 }}>
                      Full Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      required
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1.5px solid #e4e4e7',
                        borderRadius: 10,
                        fontSize: 14,
                        outline: 'none',
                        transition: 'border-color 150ms',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#d946ef')}
                      onBlur={(e) => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52525b', marginBottom: 6 }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1.5px solid #e4e4e7',
                        borderRadius: 10,
                        fontSize: 14,
                        outline: 'none',
                        transition: 'border-color 150ms',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#d946ef')}
                      onBlur={(e) => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52525b', marginBottom: 6 }}>
                      Shipping Address
                    </label>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Fashion Street, Dhaka"
                      required
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        border: '1.5px solid #e4e4e7',
                        borderRadius: 10,
                        fontSize: 14,
                        outline: 'none',
                        resize: 'vertical',
                        transition: 'border-color 150ms',
                        fontFamily: "'Inter', sans-serif",
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#d946ef')}
                      onBlur={(e) => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                </div>
              </div>

              {/* Payment section (mock) */}
              <div
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: '1px solid #e4e4e7',
                  padding: 28,
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Payment</h2>
                <div
                  style={{
                    background: '#f0fdf4',
                    borderRadius: 12,
                    padding: '16px 20px',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <span style={{ fontSize: 20 }}>🔒</span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Mock Payment Gateway</p>
                    <p style={{ fontSize: 12, color: '#4ade80' }}>No real money will be charged. This is a simulation.</p>
                  </div>
                </div>

                {error && (
                  <div
                    style={{
                      background: '#fef2f2',
                      borderRadius: 10,
                      padding: '12px 16px',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontSize: 13,
                      marginBottom: 16,
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: 15,
                    fontWeight: 700,
                    opacity: isProcessing ? 0.7 : 1,
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
                      Processing Payment...
                    </span>
                  ) : (
                    `Pay ${formatPrice(total)}`
                  )}
                </button>
              </div>

              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </form>

            {/* Right: Order summary */}
            <div
              style={{
                background: 'white',
                borderRadius: 16,
                border: '1px solid #e4e4e7',
                padding: 24,
                position: 'sticky',
                top: 100,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Order Summary</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {items.map((item) => (
                  <div key={`${item.product.id}-${item.size}`} style={{ display: 'flex', gap: 12 }}>
                    <div
                      style={{
                        width: 56,
                        height: 72,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: '#f4f4f5',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={item.product.image_url}
                        alt={item.product.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.3,
                          marginBottom: 4,
                        }}
                      >
                        {item.product.title}
                      </p>
                      <p style={{ fontSize: 12, color: '#71717a' }}>
                        Qty: {item.quantity}
                        {item.size && ` · Size: ${item.size}`}
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#9333ea', marginTop: 2 }}>
                        {formatPrice(item.product.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #e4e4e7', marginTop: 20, paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#71717a', fontSize: 14 }}>Subtotal</span>
                  <span style={{ fontSize: 14 }}>{formatPrice(total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#71717a', fontSize: 14 }}>Shipping</span>
                  <span style={{ fontSize: 14, color: '#22c55e', fontWeight: 600 }}>Free</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #e4e4e7',
                    paddingTop: 12,
                    marginTop: 8,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
