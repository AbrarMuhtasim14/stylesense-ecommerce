'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useCart } from '@/lib/cart-context';
import { getCurrentUser, login, signup, logout, type User } from '@/lib/auth';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { itemCount, toggleDrawer } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  // Profile dropdown state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync auth state
  useEffect(() => {
    // Sync in a microtask to avoid react-hooks/set-state-in-effect error
    Promise.resolve().then(() => {
      const user = getCurrentUser();
      setCurrentUser(user);
    });

    const handleAuthChange = (e: Event) => {
      const customEvent = e as CustomEvent<User | null>;
      setCurrentUser(customEvent.detail);
    };

    window.addEventListener('auth-state-change', handleAuthChange);
    return () => {
      window.removeEventListener('auth-state-change', handleAuthChange);
    };
  }, []);

  // Handle outside clicks to close profile dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    if (profileDropdownOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [profileDropdownOpen]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (!authEmail.trim()) {
      setAuthError('Email is required');
      return;
    }
    
    if (authMode === 'signup' && !authName.trim()) {
      setAuthError('Name is required');
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        // For our mock, we allow login with name if entered, otherwise default
        const nameToUse = authName.trim() || authEmail.split('@')[0];
        await login(authEmail.trim(), nameToUse);
      } else {
        await signup(authEmail.trim(), authName.trim());
      }
      setAuthModalOpen(false);
      setAuthEmail('');
      setAuthName('');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setProfileDropdownOpen(false);
    router.push('/');
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const navLinks = [
    { href: '/products', label: 'Catalog' },
    { href: '/search', label: 'AI Search' },
    { href: '/admin', label: 'Admin' },
  ];

  return (
    <>
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: scrolled ? '1px solid #e4e4e7' : '1px solid transparent',
          transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: scrolled ? '0 1px 12px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <div className="container" style={{ height: 64, display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Logo */}
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
            >
              ✦
            </div>
            <span
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 800,
                fontSize: 20,
                background: 'linear-gradient(135deg, #d946ef 0%, #9333ea 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              StyleSense
            </span>
          </Link>

          {/* Desktop search */}
          <form
            onSubmit={handleSearch}
            style={{
              flex: 1,
              maxWidth: 400,
              display: 'flex',
              alignItems: 'center',
              background: 'white',
              border: '1.5px solid #e4e4e7',
              borderRadius: 100,
              overflow: 'hidden',
              transition: 'all 250ms ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
            className="hidden-mobile"
          >
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by style, color..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                padding: '9px 16px',
                fontSize: 14,
                background: 'transparent',
                color: '#18181b',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '7px 16px',
                margin: '4px',
                background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                border: 'none',
                borderRadius: 100,
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Search
            </button>
          </form>

          {/* Desktop nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }} className="hidden-mobile">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname.startsWith(link.href) ? 'active' : ''}`}
                style={{
                  padding: '8px 12px',
                  fontSize: 14,
                  fontWeight: 500,
                  color: pathname.startsWith(link.href) ? '#9333ea' : '#52525b',
                  textDecoration: 'none',
                  transition: 'color 200ms ease',
                }}
              >
                {link.label}
              </Link>
            ))}

            {/* Cart button */}
            <button
              onClick={() => toggleDrawer(true)}
              style={{
                position: 'relative',
                padding: '8px 16px',
                border: '1.5px solid #e4e4e7',
                borderRadius: 100,
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                color: '#18181b',
                marginLeft: 8,
                transition: 'border-color 200ms ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              Cart
              {itemCount > 0 && (
                <span
                  style={{
                    background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 700,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {itemCount}
                </span>
              )}
            </button>

            {/* Authentication UI Integration */}
            {currentUser ? (
              <div style={{ position: 'relative', marginLeft: 12 }} ref={dropdownRef}>
                <button
                  id="nav-avatar-btn"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(147, 51, 234, 0.25)',
                    transition: 'all 200ms ease',
                  }}
                >
                  {getInitials(currentUser.name)}
                </button>

                {profileDropdownOpen && (
                  <div
                    id="nav-profile-dropdown"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      width: 220,
                      background: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(228, 228, 231, 0.8)',
                      borderRadius: 16,
                      boxShadow: '0 10px 25px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.02)',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      zIndex: 50,
                      animation: 'slideUp 150ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #f4f4f5', marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#a1a1aa' }}>Signed in as</p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentUser.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentUser.email}
                      </p>
                    </div>

                    <Link
                      id="nav-profile-link"
                      href="/profile"
                      onClick={() => setProfileDropdownOpen(false)}
                      style={{
                        padding: '8px 12px',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#27272a',
                        textDecoration: 'none',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f4f5')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Profile Dashboard
                    </Link>

                    <button
                      id="nav-logout-btn"
                      onClick={handleLogout}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#ef4444',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                id="nav-signin-btn"
                onClick={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                style={{
                  padding: '8px 20px',
                  borderRadius: 100,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  border: 'none',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginLeft: 12,
                  boxShadow: '0 0 15px rgba(217, 70, 239, 0.35)',
                  transition: 'transform 200ms ease, box-shadow 200ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(217, 70, 239, 0.55)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(217, 70, 239, 0.35)';
                }}
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }} className="visible-mobile">
            {currentUser && (
              <Link
                href="/profile"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(147, 51, 234, 0.25)',
                }}
              >
                {getInitials(currentUser.name)}
              </Link>
            )}
            {!currentUser && (
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 100,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  border: 'none',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(217, 70, 239, 0.3)',
                }}
              >
                Sign In
              </button>
            )}
            
            <button
              onClick={() => toggleDrawer(true)}
              style={{
                position: 'relative',
                width: 40,
                height: 40,
                border: '1.5px solid #e4e4e7',
                borderRadius: 8,
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              {itemCount > 0 && (
                <span className="cart-badge">{itemCount}</span>
              )}
            </button>
            
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{
                width: 40,
                height: 40,
                border: '1.5px solid #e4e4e7',
                borderRadius: 8,
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mobileOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            style={{
              borderTop: '1px solid #e4e4e7',
              padding: '16px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: 'white',
            }}
          >
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1.5px solid #e4e4e7',
                  borderRadius: 10,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm">Go</button>
            </form>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  padding: '12px 0',
                  fontSize: 16,
                  fontWeight: 500,
                  color: pathname.startsWith(link.href) ? '#9333ea' : '#18181b',
                  textDecoration: 'none',
                  borderBottom: '1px solid #f4f4f5',
                }}
              >
                {link.label}
              </Link>
            ))}
            {currentUser && (
              <>
                <Link
                  href="/profile"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    padding: '12px 0',
                    fontSize: 16,
                    fontWeight: 500,
                    color: pathname === '/profile' ? '#9333ea' : '#18181b',
                    textDecoration: 'none',
                    borderBottom: '1px solid #f4f4f5',
                  }}
                >
                  My Profile
                </Link>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  style={{
                    padding: '12px 0',
                    fontSize: 16,
                    fontWeight: 500,
                    color: '#ef4444',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  Log Out
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Spacer */}
      <div style={{ height: 64 }} />

      {/* Elegant Glassmorphism Auth Modal */}
      {authModalOpen && (
        <div
          id="auth-modal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(9, 9, 11, 0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Backdrop Click */}
          <div
            style={{ position: 'absolute', inset: 0 }}
            onClick={() => setAuthModalOpen(false)}
          />

          {/* Modal Container */}
          <div
            style={{
              position: 'relative',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.45)',
              borderRadius: 24,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0,0,0,0.02)',
              padding: '32px',
              width: '100%',
              maxWidth: 400,
              zIndex: 10,
              animation: 'scaleIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Close Button */}
            <button
              id="auth-close-btn"
              onClick={() => setAuthModalOpen(false)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(244, 244, 245, 0.8)',
                border: 'none',
                color: '#71717a',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 150ms ease, color 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e4e4e7';
                e.currentTarget.style.color = '#18181b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(244, 244, 245, 0.8)';
                e.currentTarget.style.color = '#71717a';
              }}
            >
              ✕
            </button>

            {/* Modal Title */}
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: 24,
                marginBottom: 8,
                background: 'linear-gradient(135deg, #18181b 0%, #3f3f46 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p style={{ fontSize: 14, color: '#71717a', marginBottom: 24, marginTop: 0 }}>
              {authMode === 'login'
                ? 'Sign in to access your dashboard and order details.'
                : 'Join StyleSense for premium customized styling recommendations.'}
            </p>

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

            {/* Form */}
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label
                  htmlFor="auth-email-input"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3f3f46', marginBottom: 6 }}
                >
                  Email Address
                </label>
                <input
                  id="auth-email-input"
                  type="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '1.5px solid #e4e4e7',
                    background: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                    boxSizing: 'border-box',
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

              {/* Show Name input for signup, OR make it optional/shown for login if desired.
                  The instructions say: modal asking for Email and Name (for sign up or login).
                  Let's make sure both fields are shown or toggleable. Let's make Name field shown for both,
                  or at least present so they can enter it. Showing it always or for signup is extremely premium.
                  Let's show it always, but label it as "Full Name (Optional for Sign In)" or make it simple!
                  "glassmorphism Modal asking for their Email and Name (for sign up or login)."
                  Let's show both Name and Email inputs. If logging in, Name can be optional or pre-filled. */}
              <div>
                <label
                  htmlFor="auth-name-input"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3f3f46', marginBottom: 6 }}
                >
                  {authMode === 'signup' ? 'Full Name' : 'Full Name (Optional)'}
                </label>
                <input
                  id="auth-name-input"
                  type="text"
                  placeholder="John Doe"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  required={authMode === 'signup'}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '1.5px solid #e4e4e7',
                    background: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                    boxSizing: 'border-box',
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

              {/* Submit Button */}
              <button
                id="auth-submit-btn"
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
                  marginTop: 8,
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.25)',
                  transition: 'opacity 150ms ease, transform 150ms ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {authLoading ? (
                  <>
                    <svg
                      style={{ animation: 'spin 1s linear infinite' }}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M4 12a8 8 0 0 1 8-8V4" />
                    </svg>
                    Processing...
                  </>
                ) : authMode === 'login' ? (
                  'Sign In'
                ) : (
                  'Sign Up'
                )}
              </button>
            </form>

            {/* Toggle Mode */}
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                id="auth-toggle-mode"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  setAuthError('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9333ea',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {authMode === 'login'
                  ? "Don't have an account? Sign Up"
                  : 'Already have an account? Sign In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Keyframe animations in stylesheet */}
      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
        }
        @media (min-width: 769px) {
          .visible-mobile { display: none !important; }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
