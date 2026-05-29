'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentUser, login, type User } from '@/lib/auth';
import { getMyOrders, sendChatMessage } from '@/lib/api';

function generateSessionId(orderNumber: string): string {
  return `profile-cancel-${orderNumber}-${Date.now()}`;
}

interface OrderRow {
  id: string;
  order_number: string;
  product_id: number;
  customer_name: string;
  customer_email: string;
  quantity: number;
  total_price: number;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shipping_address: string;
  created_at: string;
  products?: {
    id: number;
    title: string;
    image_url: string;
    price: number;
    category: string;
  };
}

interface GroupedOrder {
  order_number: string;
  created_at: string;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shipping_address: string;
  total_price: number;
  items: Array<{
    id: string;
    product_id: number;
    title: string;
    image_url: string;
    price: number;
    quantity: number;
    item_total: number;
    category: string;
  }>;
}

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Local auth form states (shown only if logged out)
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  // Interactive cancellation states
  const [cancellingOrders, setCancellingOrders] = useState<Record<string, boolean>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch session and orders on mount
  useEffect(() => {
    const fetchUserAndOrders = async () => {
      const user = getCurrentUser();
      setCurrentUser(user);
      if (user) {
        try {
          const fetchedOrders = await getMyOrders(user.email);
          setOrders(fetchedOrders);
        } catch (err) {
          console.error('Failed to fetch orders:', err);
        }
      }
      setLoading(false);
    };

    fetchUserAndOrders();

    // Listen for global auth changes
    const handleAuthChange = async (e: Event) => {
      const customEvent = e as CustomEvent<User | null>;
      const newUser = customEvent.detail;
      setCurrentUser(newUser);
      if (newUser) {
        setLoading(true);
        try {
          const fetchedOrders = await getMyOrders(newUser.email);
          setOrders(fetchedOrders);
        } catch (err) {
          console.error('Failed to fetch orders:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setOrders([]);
      }
    };

    window.addEventListener('auth-state-change', handleAuthChange);
    return () => {
      window.removeEventListener('auth-state-change', handleAuthChange);
    };
  }, []);

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!emailInput.trim()) {
      setAuthError('Email is required');
      return;
    }
    
    setAuthLoading(true);
    try {
      const name = nameInput.trim() || emailInput.split('@')[0];
      await login(emailInput.trim(), name);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Login failed.';
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCancelOrder = async (orderNumber: string) => {
    if (!currentUser) return;
    
    // Smooth loading fade triggering
    setCancellingOrders((prev) => ({ ...prev, [orderNumber]: true }));
    setSuccessMessage('');
    setErrorMessage('');
    
    try {
      // Trigger AI order cancellation tool call via /agent/chat
      const response = await sendChatMessage({
        message: `Please cancel my order ${orderNumber} under email ${currentUser.email}`,
        session_id: generateSessionId(orderNumber)
      });
      
      // Fetch latest orders state
      const updatedOrders = await getMyOrders(currentUser.email);
      setOrders(updatedOrders);
      
      if (response.reply.includes('successfully') || response.reply.toLowerCase().includes('cancelled')) {
        setSuccessMessage(`Order ${orderNumber} has been successfully cancelled and refunded.`);
      } else {
        setSuccessMessage(`Cancellation request processed: ${response.reply}`);
      }
      
      setTimeout(() => setSuccessMessage(''), 8000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : `Failed to cancel order ${orderNumber}. Please try again.`;
      setErrorMessage(errMsg);
      setTimeout(() => setErrorMessage(''), 8000);
    } finally {
      setCancellingOrders((prev) => ({ ...prev, [orderNumber]: false }));
    }
  };

  const groupOrders = (rows: OrderRow[]): GroupedOrder[] => {
    const map: Record<string, GroupedOrder> = {};
    
    rows.forEach((row) => {
      if (!map[row.order_number]) {
        map[row.order_number] = {
          order_number: row.order_number,
          created_at: row.created_at,
          status: row.status,
          shipping_address: row.shipping_address,
          total_price: 0,
          items: [],
        };
      }
      
      map[row.order_number].total_price += row.total_price;
      map[row.order_number].items.push({
        id: row.id,
        product_id: row.product_id,
        title: row.products?.title || `Product #${row.product_id}`,
        image_url: row.products?.image_url || '/placeholder.jpg',
        price: row.products?.price || (row.total_price / row.quantity),
        quantity: row.quantity,
        item_total: row.total_price,
        category: row.products?.category || 'Fashion',
      });
    });

    return Object.values(map).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const groupedOrders = groupOrders(orders);
  
  // Calculate summary stats
  const totalSpent = groupedOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total_price, 0);

  const activeOrdersCount = groupedOrders.filter((o) => o.status === 'processing').length;

  if (loading) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at top left, rgba(217, 70, 239, 0.05), transparent)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="spinner" />
          <span style={{ fontSize: 14, color: '#71717a', fontWeight: 500 }}>Loading Dashboard...</span>
        </div>
        <style>{`
          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(147, 51, 234, 0.1);
            border-radius: 50%;
            border-top-color: #9333ea;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Logged out premium UI view
  if (!currentUser) {
    return (
      <div
        style={{
          minHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'radial-gradient(circle at top right, rgba(217, 70, 239, 0.06), transparent 50%), radial-gradient(circle at bottom left, rgba(147, 51, 234, 0.05), transparent 50%)',
        }}
      >
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.01)',
            borderRadius: 24,
            padding: '40px 32px',
            maxWidth: 420,
            width: '100%',
            animation: 'scaleUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 24,
                marginBottom: 16,
                boxShadow: '0 8px 16px rgba(147, 51, 234, 0.2)',
              }}
            >
              ✦
            </div>
            <h1
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: 26,
                margin: '0 0 8px 0',
                color: '#18181b',
              }}
            >
              My Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: '#71717a', lineHeight: 1.5 }}>
              Sign in to view orders, track active package status, and request automatic cancellations.
            </p>
          </div>

          {authError && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fee2e2',
                borderRadius: 12,
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 16,
              }}
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleLocalLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3f3f46', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                id="profile-login-email"
                type="email"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1.5px solid #e4e4e7',
                  background: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 150ms ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#9333ea';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(147, 51, 234, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e4e4e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3f3f46', marginBottom: 6 }}>
                Full Name (Optional)
              </label>
              <input
                id="profile-login-name"
                type="text"
                placeholder="John Doe"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1.5px solid #e4e4e7',
                  background: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 150ms ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#9333ea';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(147, 51, 234, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e4e4e7';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              id="profile-login-submit"
              type="submit"
              disabled={authLoading}
              style={{
                width: '100%',
                padding: '12px 24px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                border: 'none',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.25)',
                transition: 'opacity 150ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {authLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
        <style>{`
          @keyframes scaleUp {
            from { transform: scale(0.96); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 16px 80px 16px',
        background: 'radial-gradient(circle at top left, rgba(217, 70, 239, 0.05), transparent 45%), radial-gradient(circle at bottom right, rgba(147, 51, 234, 0.04), transparent 40%)',
      }}
    >
      <div className="container" style={{ maxWidth: 1040, margin: '0 auto' }}>
        
        {/* Floating Toast Notification */}
        {(successMessage || errorMessage) && (
          <div
            style={{
              position: 'fixed',
              top: 80,
              right: 24,
              zIndex: 100,
              background: successMessage ? '#10b981' : '#ef4444',
              color: 'white',
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              animation: 'slideIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <span>{successMessage || errorMessage}</span>
          </div>
        )}

        {/* Hero Welcome Banner */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            borderRadius: 24,
            padding: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 24,
            marginBottom: 32,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* User Avatar Circle */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                color: 'white',
                fontSize: 24,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(147, 51, 234, 0.3)',
              }}
            >
              {currentUser.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            
            <div>
              <h1
                id="profile-user-name"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 700,
                  fontSize: 28,
                  margin: '0 0 4px 0',
                  color: '#18181b',
                }}
              >
                {currentUser.name}
              </h1>
              <p
                id="profile-user-email"
                style={{ margin: 0, fontSize: 14, color: '#71717a', fontWeight: 500 }}
              >
                {currentUser.email}
              </p>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1.5px solid #e4e4e7',
                borderRadius: 16,
                padding: '16px 20px',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>
                TOTAL SPENT
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#18181b' }}>
                ৳{totalSpent.toLocaleString()}
              </span>
            </div>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1.5px solid #e4e4e7',
                borderRadius: 16,
                padding: '16px 20px',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a', display: 'block', marginBottom: 4 }}>
                ACTIVE ORDERS
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#9333ea' }}>
                {activeOrdersCount}
              </span>
            </div>
          </div>
        </div>

        {/* Orders Section */}
        <div>
          <h2
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: '#18181b',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Order History
            <span
              style={{
                background: '#f4f4f5',
                color: '#71717a',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 100,
              }}
            >
              {groupedOrders.length}
            </span>
          </h2>

          {groupedOrders.length === 0 ? (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.75)',
                border: '1px solid #e4e4e7',
                borderRadius: 20,
                padding: '48px 24px',
                textAlign: 'center',
                boxShadow: '0 10px 30px rgba(0,0,0,0.01)',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🛒</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#18181b', margin: '0 0 8px 0' }}>
                No Orders Placed Yet
              </h3>
              <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 20px 0' }}>
                Browse our luxury catalogue and place your first order.
              </p>
              <Link
                href="/products"
                className="btn"
                style={{
                  display: 'inline-block',
                  background: '#18181b',
                  color: 'white',
                  padding: '10px 24px',
                  borderRadius: 100,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background 200ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#27272a')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#18181b')}
              >
                Explore Catalog
              </Link>
            </div>
          ) : (
            <div
              id="profile-orders-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              {groupedOrders.map((order) => {
                const isCancelling = cancellingOrders[order.order_number] || false;
                const statusColors = {
                  processing: { bg: 'rgba(245, 158, 11, 0.12)', color: '#d97706', glow: 'rgba(245, 158, 11, 0.25)' },
                  shipped: { bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', glow: 'rgba(59, 130, 246, 0.25)' },
                  delivered: { bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', glow: 'rgba(16, 185, 129, 0.3)' },
                  cancelled: { bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', glow: 'rgba(239, 68, 68, 0.25)' },
                };
                const colorScheme = statusColors[order.status] || statusColors.processing;

                return (
                  <div
                    key={order.order_number}
                    style={{
                      background: 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(228, 228, 231, 0.8)',
                      borderRadius: 20,
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.02)',
                      overflow: 'hidden',
                      transition: 'opacity 300ms ease, transform 300ms ease',
                      opacity: isCancelling ? 0.6 : 1,
                    }}
                  >
                    {/* Order Header Info */}
                    <div
                      style={{
                        padding: '20px 24px',
                        background: 'rgba(244, 244, 245, 0.4)',
                        borderBottom: '1px solid #e4e4e7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', display: 'block', textTransform: 'uppercase' }}>
                            Order Number
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#18181b' }}>
                            {order.order_number}
                          </span>
                        </div>
                        
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', display: 'block', textTransform: 'uppercase' }}>
                            Placed On
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#3f3f46' }}>
                            {new Date(order.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', display: 'block', textTransform: 'uppercase' }}>
                            Total Price
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#9333ea' }}>
                            ৳{order.total_price.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Status and Cancellation actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Status Badge */}
                        <span
                          style={{
                            background: colorScheme.bg,
                            color: colorScheme.color,
                            boxShadow: `0 0 10px ${colorScheme.glow}`,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '6px 14px',
                            borderRadius: 100,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: colorScheme.color }} />
                          {order.status}
                        </span>

                        {/* cancel action */}
                        {order.status === 'processing' && (
                          <button
                            id={`cancel-btn-${order.order_number}`}
                            onClick={() => handleCancelOrder(order.order_number)}
                            disabled={isCancelling}
                            style={{
                              background: 'transparent',
                              border: '1.5px solid #ef4444',
                              color: '#ef4444',
                              borderRadius: 100,
                              padding: '6px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 200ms ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#ef4444';
                              e.currentTarget.style.color = 'white';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.25)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#ef4444';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {isCancelling ? (
                              <>
                                <svg
                                  style={{ animation: 'spin 1s linear infinite' }}
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                >
                                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                                Cancelling...
                              </>
                            ) : (
                              'Cancel Order'
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Products List Nested Inside */}
                    <div style={{ padding: '24px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 16,
                              borderBottom: order.items.length > 1 ? '1px solid #f4f4f5' : 'none',
                              paddingBottom: order.items.length > 1 ? 16 : 0,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              <img
                                src={item.image_url}
                                alt={item.title}
                                style={{
                                  width: 60,
                                  height: 60,
                                  borderRadius: 8,
                                  objectFit: 'cover',
                                  border: '1px solid #e4e4e7',
                                  background: '#f4f4f5',
                                }}
                              />
                              
                              <div>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: '#18181b' }}>
                                  {item.title}
                                </h4>
                                <span style={{ fontSize: 12, color: '#71717a', fontWeight: 500 }}>
                                  Category: {item.category} • Quantity: {item.quantity}
                                </span>
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#18181b', display: 'block' }}>
                                ৳{item.item_total.toLocaleString()}
                              </span>
                              <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 500 }}>
                                ৳{item.price.toLocaleString()} each
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Delivery Address block */}
                      <div
                        style={{
                          marginTop: 20,
                          padding: '12px 16px',
                          background: '#f4f4f5',
                          borderRadius: 12,
                          fontSize: 13,
                          color: '#52525b',
                          fontWeight: 500,
                        }}
                      >
                        <strong style={{ color: '#27272a' }}>Shipping Address: </strong>
                        {order.shipping_address}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
      
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
