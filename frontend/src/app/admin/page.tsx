'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/types';
import { 
  adminUpload, 
  getProducts, 
  adminDeleteProduct, 
  adminUpdateProduct,
  getAdminOrders,
  updateOrderStatus,
  getTickets,
  updateTicketStatus
} from '@/lib/api';
import { formatPrice, formatDate, truncate } from '@/lib/utils';

const ADMIN_PASSWORD_KEY = 'stylesense_admin_pw';

const CATEGORIES = [
  'Topwear', 'Bottomwear', 'Footwear', 'Bags', 'Watches', 'Sunglasses',
  'Accessories', 'Innerwear', 'Ethnic', 'Sportswear',
];
const GENDERS = ['Men', 'Women', 'Unisex', 'Boys', 'Girls'];
const SEASONS = ['Summer', 'Winter', 'Spring', 'Fall'];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [storedPassword, setStoredPassword] = useState('');

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'corrupted' | 'normal'>('all');

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ product: Product; visual_description: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Topwear',
    color: '',
    gender: 'Unisex',
    price: '',
    description: '',
    sub_category: '',
    season: '',
    usage_type: '',
  });

  // Active tab
  const [activeTab, setActiveTab] = useState<'upload' | 'products' | 'orders' | 'tickets'>('upload');

  // Orders states
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [updatingOrderNumber, setUpdatingOrderNumber] = useState<string | null>(null);

  // Tickets states
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<string>('all');
  const [ticketActionLoading, setTicketActionLoading] = useState<number | null>(null);
  const [ticketNotes, setTicketNotes] = useState<{ [key: number]: string }>({});

  // Edit & Delete state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [editFormData, setEditFormData] = useState({
    title: '',
    category: '',
    color: '',
    gender: '',
    price: '',
    description: '',
    visual_description: '',
    sub_category: '',
    season: '',
    usage_type: '',
    regenerate_description: false,
  });

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditFile(null);
    setEditPreview(null);
    setEditError('');
    setEditFormData({
      title: product.title || '',
      category: product.category || 'Topwear',
      color: product.color || '',
      gender: product.gender || 'Unisex',
      price: String(product.price || ''),
      description: product.description || '',
      visual_description: product.visual_description || '',
      sub_category: product.sub_category || '',
      season: product.season || '',
      usage_type: product.usage_type || '',
      regenerate_description: false,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editFormData.title || !editFormData.color || !editFormData.price) {
      setEditError('Title, color, and price are required.');
      return;
    }

    setEditLoading(true);
    setEditError('');

    try {
      const form = new FormData();
      if (editFile) {
        form.append('image', editFile);
      }
      form.append('title', editFormData.title);
      form.append('category', editFormData.category);
      form.append('color', editFormData.color);
      form.append('gender', editFormData.gender);
      form.append('price', editFormData.price);
      form.append('description', editFormData.description);
      form.append('visual_description', editFormData.visual_description);
      form.append('sub_category', editFormData.sub_category);
      form.append('season', editFormData.season);
      form.append('usage_type', editFormData.usage_type);
      form.append('regenerate_description', String(editFormData.regenerate_description));

      const updated = await adminUpdateProduct(editingProduct.id, form, storedPassword);
      
      // Update local state without full reload
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingProduct(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingProduct) return;
    setDeleteLoading(true);
    try {
      await adminDeleteProduct(deletingProduct.id, storedPassword);
      setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
      setDeletingProduct(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_PASSWORD_KEY);
    if (stored) {
      setStoredPassword(stored);
      setIsAuthenticated(true);
      setPassword(stored);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setAuthError('Please enter the admin password');
      return;
    }
    // We validate the password by attempting an API call
    // For now, store it and try
    localStorage.setItem(ADMIN_PASSWORD_KEY, password);
    setStoredPassword(password);
    setIsAuthenticated(true);
    setAuthError('');
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
    setIsAuthenticated(false);
    setPassword('');
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const prods = await getProducts({ limit: 200 });
      setProducts(prods);
    } catch (err) {
      console.error(err);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const ords = await getAdminOrders(storedPassword);
      setOrders(ords || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const tix = await getTickets(storedPassword, ticketFilter === 'all' ? undefined : ticketFilter);
      setTickets(tix || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleOrderStatusUpdate = async (orderNumber: string, status: string) => {
    setUpdatingOrderNumber(orderNumber);
    try {
      await updateOrderStatus(orderNumber, status, storedPassword);
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert('Failed to update order status');
    } finally {
      setUpdatingOrderNumber(null);
    }
  };

  const handleTicketAction = async (ticketId: number, action: 'APPROVE' | 'REJECT' | 'ESCALATE') => {
    setTicketActionLoading(ticketId);
    try {
      const notes = ticketNotes[ticketId] || '';
      await updateTicketStatus(ticketId, action, notes, storedPassword);
      setTicketNotes(prev => {
        const copy = { ...prev };
        delete copy[ticketId];
        return copy;
      });
      await loadTickets();
    } catch (err) {
      console.error(err);
      alert('Failed to update ticket status');
    } finally {
      setTicketActionLoading(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'products') {
        loadProducts();
      } else if (activeTab === 'orders') {
        loadOrders();
      } else if (activeTab === 'tickets') {
        loadTickets();
      }
    }
  }, [isAuthenticated, activeTab, ticketFilter]);

  const getGroupedOrders = () => {
    const groups: { [key: string]: any } = {};
    orders.forEach(o => {
      if (!groups[o.order_number]) {
        groups[o.order_number] = {
          order_number: o.order_number,
          customer_name: o.customer_name,
          customer_email: o.customer_email,
          shipping_address: o.shipping_address,
          status: o.status,
          created_at: o.created_at,
          items: [],
          total_price: 0,
        };
      }
      groups[o.order_number].items.push(o);
      groups[o.order_number].total_price += Number(o.total_price);
    });

    return Object.values(groups).filter((group: any) => {
      if (orderFilter !== 'all' && group.status !== orderFilter) return false;
      if (orderSearchQuery.trim()) {
        const query = orderSearchQuery.toLowerCase();
        const matchesNum = group.order_number.toLowerCase().includes(query);
        const matchesName = group.customer_name.toLowerCase().includes(query);
        const matchesEmail = group.customer_email.toLowerCase().includes(query);
        return matchesNum || matchesName || matchesEmail;
      }
      return true;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
      setUploadResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
      setUploadResult(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select an image first.');
      return;
    }
    if (!formData.title || !formData.color || !formData.price) {
      setUploadError('Title, color, and price are required.');
      return;
    }

    setUploadLoading(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const result = await adminUpload(
        uploadFile,
        {
          title: formData.title,
          category: formData.category,
          color: formData.color,
          gender: formData.gender,
          price: Number(formData.price),
          description: formData.description || undefined,
          sub_category: formData.sub_category || undefined,
          season: formData.season || undefined,
          usage_type: formData.usage_type || undefined,
        },
        storedPassword
      );

      setUploadResult(result);
      // Reset form
      setUploadFile(null);
      setUploadPreview(null);
      setFormData({
        title: '', category: 'Topwear', color: '', gender: 'Unisex',
        price: '', description: '', sub_category: '', season: '', usage_type: '',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('password')) {
        setUploadError('Wrong admin password. Please log out and try again.');
      } else {
        setUploadError(msg);
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (filter === 'corrupted') return p.is_corrupted;
    if (filter === 'normal') return !p.is_corrupted;
    return true;
  });

  // ──────────────────────────────────────────────
  // LOGIN GATE
  // ──────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <>
        <title>Admin Portal | StyleSense</title>
        <div
          style={{
            minHeight: '70vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 24px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'white',
              borderRadius: 24,
              border: '1.5px solid #e4e4e7',
              padding: 40,
              boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  margin: '0 auto 16px',
                }}
              >
                🔒
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800 }}>Admin Portal</h1>
              <p style={{ color: '#71717a', marginTop: 8, fontSize: 14 }}>
                Enter your admin password to access the catalog management portal
              </p>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                className="input"
                style={{ textAlign: 'center', letterSpacing: '0.1em', fontSize: 18 }}
                autoFocus
              />
              {authError && (
                <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{authError}</p>
              )}
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                Access Admin Portal
              </button>
            </form>

            <p style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
              The password is set via the <code>ADMIN_PASSWORD</code> environment variable on the backend.
            </p>
          </div>
        </div>
      </>
    );
  }

  // ──────────────────────────────────────────────
  // ADMIN DASHBOARD
  // ──────────────────────────────────────────────
  return (
    <>
      <title>Admin Portal | StyleSense</title>
      <div className="container" style={{ padding: '32px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                ⚙️
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800 }}>Admin Portal</h1>
            </div>
            <p style={{ color: '#71717a' }}>Catalog management & AI product pipeline</p>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: '#f4f4f5',
            padding: 4,
            borderRadius: 14,
            marginBottom: 28,
            width: 'fit-content',
            flexWrap: 'wrap',
          }}
        >
          {(['upload', 'products', 'orders', 'tickets'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: activeTab === tab ? 'white' : 'transparent',
                color: activeTab === tab ? '#18181b' : '#71717a',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: 14,
                boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 200ms',
              }}
            >
              {tab === 'upload' ? '➕ Upload Product' : 
               tab === 'products' ? '📦 Product Table' : 
               tab === 'orders' ? '🚚 Order Management' : '🎫 Support Tickets'}
            </button>
          ))}
        </div>

        {/* ── UPLOAD TAB ── */}
        {activeTab === 'upload' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }} className="admin-grid">
            {/* Upload form */}
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                Add New Product
              </h2>

              <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Image drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !uploadFile && fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? '#d946ef' : uploadFile ? '#22c55e' : '#e4e4e7'}`,
                    borderRadius: 16,
                    padding: uploadFile ? 16 : 36,
                    background: isDragging ? '#fdf4ff' : uploadFile ? '#f0fdf4' : '#fafafa',
                    cursor: uploadFile ? 'default' : 'pointer',
                    transition: 'all 200ms',
                    textAlign: uploadFile ? 'left' : 'center',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {uploadFile && uploadPreview ? (
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 12,
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: '2px solid #22c55e',
                        }}
                      >
                        <img src={uploadPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600 }}>{uploadFile.name}</p>
                        <p style={{ fontSize: 12, color: '#71717a', marginTop: 4 }}>
                          {(uploadFile.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setUploadFile(null); setUploadPreview(null); }}
                        className="btn btn-secondary btn-sm"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                      <p style={{ fontWeight: 600, marginBottom: 4 }}>Drop product image</p>
                      <p style={{ fontSize: 13, color: '#71717a' }}>JPG, PNG, WebP</p>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Product Title *
                  </label>
                  <input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                    className="input"
                    placeholder="e.g. Cotton Crew Neck Tee"
                  />
                </div>

                {/* Category + Gender row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Category *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData(f => ({ ...f, category: e.target.value }))}
                      className="input"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Gender *
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData(f => ({ ...f, gender: e.target.value }))}
                      className="input"
                    >
                      {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                {/* Color + Price row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Color *
                    </label>
                    <input
                      required
                      value={formData.color}
                      onChange={(e) => setFormData(f => ({ ...f, color: e.target.value }))}
                      className="input"
                      placeholder="e.g. Navy Blue"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Price (৳) *
                    </label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={formData.price}
                      onChange={(e) => setFormData(f => ({ ...f, price: e.target.value }))}
                      className="input"
                      placeholder="e.g. 1299"
                    />
                  </div>
                </div>

                {/* Season + Usage */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Season
                    </label>
                    <select
                      value={formData.season}
                      onChange={(e) => setFormData(f => ({ ...f, season: e.target.value }))}
                      className="input"
                    >
                      <option value="">—</option>
                      {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Usage Type
                    </label>
                    <input
                      value={formData.usage_type}
                      onChange={(e) => setFormData(f => ({ ...f, usage_type: e.target.value }))}
                      className="input"
                      placeholder="e.g. Casual, Formal"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Description (optional — AI will generate if omitted)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Leave blank to let Gemini generate it from the image..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1.5px solid #e4e4e7',
                      borderRadius: 10,
                      fontSize: 14,
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      color: '#18181b',
                    }}
                  />
                </div>

                {uploadError && (
                  <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 10, fontSize: 13, color: '#991b1b' }}>
                    {uploadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploadLoading || !uploadFile}
                  className="btn btn-primary btn-lg"
                >
                  {uploadLoading ? (
                    <>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }}
                      />
                      Uploading & generating AI embeddings…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Upload & Generate AI Embeddings
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Upload result / guide */}
            <div>
              {uploadResult ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: 20,
                    padding: 24,
                    animation: 'fadeInUp 0.4s ease-out',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 24 }}>✅</span>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>Upload Successful!</h3>
                  </div>

                  {/* Product preview */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: 16,
                      background: 'white',
                      borderRadius: 14,
                      border: '1px solid #bbf7d0',
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 100,
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: '#f4f4f5',
                      }}
                    >
                      <img
                        src={uploadResult.product.image_url}
                        alt={uploadResult.product.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>{uploadResult.product.title}</p>
                      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 4 }}>
                        {uploadResult.product.category} • {uploadResult.product.color} • {uploadResult.product.gender}
                      </p>
                      <p
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        {formatPrice(uploadResult.product.price)}
                      </p>
                    </div>
                  </div>

                  {/* AI visual description */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span className="ai-vision-badge">What Gemini AI Sees</span>
                    </div>
                    <p style={{ fontSize: 14, color: '#065f46', lineHeight: 1.8, background: 'white', padding: 14, borderRadius: 10, border: '1px solid #bbf7d0' }}>
                      {uploadResult.visual_description || uploadResult.product.visual_description || 'No visual description generated.'}
                    </p>
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <Link
                      href={`/products/${uploadResult.product.id}`}
                      className="btn btn-primary btn-sm"
                    >
                      View Product
                    </Link>
                    <Link
                      href={`/search?q=${encodeURIComponent(uploadResult.product.title)}`}
                      className="btn btn-outline btn-sm"
                    >
                      Test Search
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
                    AI Pipeline Overview
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { step: '1', title: 'Image Upload', desc: 'Your image is uploaded to Supabase Storage and given a public URL.' },
                      { step: '2', title: 'Gemini Vision', desc: 'Gemini 2.5 Flash analyzes the image and generates both a visual description and product description.' },
                      { step: '3', title: 'CLIP Embeddings', desc: 'Three 512-dimensional vectors are generated: visual (from image), text (from description), combined (60/40 weighted).' },
                      { step: '4', title: 'Immediately Searchable', desc: 'The product is inserted into the database with all embeddings. Customers can find it within seconds.' },
                    ].map(({ step, title, desc }) => (
                      <div
                        key={step}
                        style={{
                          display: 'flex',
                          gap: 14,
                          padding: 16,
                          background: '#fafafa',
                          borderRadius: 14,
                          border: '1.5px solid #e4e4e7',
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #d946ef, #9333ea)',
                            color: 'white',
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {step}
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, marginBottom: 4 }}>{title}</p>
                          <p style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6 }}>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {activeTab === 'products' && (
          <div>
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
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Product Catalog</h2>
                <p style={{ color: '#71717a', fontSize: 14, marginTop: 2 }}>
                  {products.length} products total • {products.filter(p => p.is_corrupted).length} corrupted (demo)
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'normal', 'corrupted'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  >
                    {f === 'all' ? 'All' : f === 'corrupted' ? '⚠️ Corrupted' : '✅ Normal'}
                  </button>
                ))}
                <button onClick={loadProducts} className="btn btn-secondary btn-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 .49-4.65"/>
                  </svg>
                  Refresh
                </button>
              </div>
            </div>

            {productsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />
                ))}
              </div>
            ) : (
              <div style={{ overflow: 'auto', borderRadius: 16, border: '1.5px solid #e4e4e7' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1.5px solid #e4e4e7' }}>
                      {['Image', 'Title', 'Category', 'Color', 'Price', 'Status', 'Actions'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#71717a',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, idx) => (
                      <tr
                        key={product.id}
                        style={{
                          borderBottom: '1px solid #f4f4f5',
                          background: product.is_corrupted ? '#fffbeb' : 'white',
                          transition: 'background 150ms',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = product.is_corrupted ? '#fef9c3' : '#fafafa'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = product.is_corrupted ? '#fffbeb' : 'white'; }}
                      >
                        <td style={{ padding: '10px 16px' }}>
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: '#f4f4f5',
                            }}
                          >
                            <img
                              src={product.image_url}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', maxWidth: 220 }}>
                          <p style={{ fontWeight: 600, fontSize: 13, color: '#18181b' }}>
                            {truncate(product.title, 50)}
                          </p>
                          {product.is_corrupted && product.original_name && (
                            <p style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                              Original: {truncate(product.original_name, 40)}
                            </p>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 13, color: '#52525b' }}>{product.category}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 13, color: '#52525b' }}>{product.color}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatPrice(product.price)}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {product.is_corrupted ? (
                            <span className="badge badge-corrupted">⚠ Corrupted</span>
                          ) : (
                            <span className="badge badge-success">✓ Normal</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Link
                              href={`/products/${product.id}`}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                            >
                              View
                            </Link>
                            <button
                              onClick={() => openEditModal(product)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 12, padding: '4px 8px', minHeight: 'auto', height: 28 }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingProduct(product)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 12,
                                padding: '4px 8px',
                                minHeight: 'auto',
                                height: 28,
                                color: '#ef4444',
                                borderColor: 'rgba(239, 68, 68, 0.2)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#fef2f2';
                                e.currentTarget.style.borderColor = '#ef4444';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredProducts.length === 0 && (
                  <div className="empty-state" style={{ padding: '40px 24px' }}>
                    <div className="empty-state-icon">📦</div>
                    <h3>No products</h3>
                    <p style={{ color: '#71717a' }}>No products match this filter</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <div>
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
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Order Management</h2>
                <p style={{ color: '#71717a', fontSize: 14, marginTop: 2 }}>
                  {orders.length} order lines total • {getGroupedOrders().length} matching orders
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search by order#, name, email..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #e4e4e7',
                    fontSize: 13,
                    outline: 'none',
                    width: 240,
                  }}
                />
                {(['all', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setOrderFilter(f)}
                    className={`btn ${orderFilter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {f}
                  </button>
                ))}
                <button onClick={loadOrders} className="btn btn-secondary btn-sm">
                  Refresh
                </button>
              </div>
            </div>

            {ordersLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }} />
                ))}
              </div>
            ) : getGroupedOrders().length === 0 ? (
              <div style={{ background: 'white', border: '1.5px solid #e4e4e7', borderRadius: 20, padding: '60px 24px', textAlign: 'center', color: '#71717a' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
                <h3>No Orders Found</h3>
                <p style={{ fontSize: 14 }}>Try adjusting your filters or place some test checkout orders.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {getGroupedOrders().map((order: any) => (
                  <div
                    key={order.order_number}
                    style={{
                      background: 'white',
                      border: '1.5px solid #e4e4e7',
                      borderRadius: 20,
                      padding: 24,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.01)',
                      animation: 'fadeInUp 200ms ease-out',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid #f4f4f5', paddingBottom: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: '#18181b' }}>{order.order_number}</span>
                          <span style={{ fontSize: 12, color: '#a1a1aa' }}>{formatDate(order.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 14, color: '#71717a' }}>
                          Customer: <strong style={{ color: '#18181b' }}>{order.customer_name}</strong> ({order.customer_email})
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Price</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#18181b' }}>{formatPrice(order.total_price)}</div>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <select
                            disabled={updatingOrderNumber === order.order_number}
                            value={order.status}
                            onChange={(e) => handleOrderStatusUpdate(order.order_number, e.target.value)}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 12,
                              border: '1.5px solid #e4e4e7',
                              fontWeight: 700,
                              fontSize: 13,
                              background: 
                                order.status === 'delivered' ? '#f0fdf4' :
                                order.status === 'cancelled' ? '#fef2f2' :
                                order.status === 'shipped' ? '#eff6ff' : '#fffbeb',
                              color: 
                                order.status === 'delivered' ? '#166534' :
                                order.status === 'cancelled' ? '#991b1b' :
                                order.status === 'shipped' ? '#1e40af' : '#854d0e',
                              cursor: 'pointer',
                              outline: 'none',
                              transition: 'all 200ms',
                            }}
                          >
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, flexWrap: 'wrap' }} className="admin-grid">
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Items Ordered ({order.items.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {order.items.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '1px solid #e4e4e7', background: '#f4f4f5' }}>
                                <img src={item.products?.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.products?.title}</p>
                                <p style={{ fontSize: 11, color: '#71717a', margin: '2px 0 0' }}>Qty: {item.quantity} • Size: {item.size || 'Standard'} • {item.products?.category}</p>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b' }}>{formatPrice(item.total_price)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: '#fafafa', padding: 16, borderRadius: 14, border: '1px solid #e4e4e7' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Shipping Address</div>
                        <p style={{ fontSize: 13, color: '#18181b', margin: 0, lineHeight: 1.6 }}>{order.shipping_address || 'No address provided'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TICKETS TAB ── */}
        {activeTab === 'tickets' && (
          <div>
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
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Customer Tickets & Disputes</h2>
                <p style={{ color: '#71717a', fontSize: 14, marginTop: 2 }}>
                  Review and transition return requests, quality disputes, and cancellations
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['all', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'APPROVED', 'REJECTED'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTicketFilter(f)}
                    className={`btn ${ticketFilter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {f.toLowerCase().replace('_', ' ')}
                  </button>
                ))}
                <button onClick={loadTickets} className="btn btn-secondary btn-sm">
                  Refresh
                </button>
              </div>
            </div>

            {ticketsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ background: 'white', border: '1.5px solid #e4e4e7', borderRadius: 20, padding: '60px 24px', textAlign: 'center', color: '#71717a' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
                <h3>No Support Tickets</h3>
                <p style={{ fontSize: 14 }}>There are no claims or return requests in this status.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    style={{
                      background: 'white',
                      border: '1.5px solid #e4e4e7',
                      borderRadius: 20,
                      padding: 24,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.01)',
                      animation: 'fadeInUp 200ms ease-out',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            background: 
                              ticket.type === 'cancellation' ? '#fee2e2' :
                              ticket.type === 'return' ? '#fef3c7' : '#e0f2fe',
                            color: 
                              ticket.type === 'cancellation' ? '#991b1b' :
                              ticket.type === 'return' ? '#92400e' : '#0369a1',
                          }}>
                            {ticket.type}
                          </span>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 
                              ticket.status === 'APPROVED' ? '#10b981' :
                              ticket.status === 'REJECTED' ? '#ef4444' :
                              ticket.status === 'AWAITING_EVIDENCE' ? '#3b82f6' : '#f59e0b',
                          }}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                            {formatDate(ticket.created_at)}
                          </span>
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>
                          Order #: {ticket.orders?.order_number || 'N/A'}
                        </h3>
                        <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>
                          Customer Claim: {ticket.customer_email}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', fontWeight: 700 }}>Order Total</div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{formatPrice(ticket.orders?.total_price)}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }} className="admin-grid">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ background: '#fafafa', padding: 16, borderRadius: 14, border: '1px solid #e4e4e7' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Claim Reason</div>
                          <p style={{ fontSize: 13, color: '#18181b', margin: 0, lineHeight: 1.6 }}>{ticket.reason || 'No reason specified.'}</p>
                        </div>

                        {ticket.resolution_notes && (
                          <div style={{
                            background: 
                              ticket.status === 'APPROVED' ? '#f0fdf4' :
                              ticket.status === 'REJECTED' ? '#fef2f2' : '#eff6ff',
                            padding: 16,
                            borderRadius: 14,
                            border: `1px solid ${
                              ticket.status === 'APPROVED' ? '#bbf7d0' :
                              ticket.status === 'REJECTED' ? '#fecaca' : '#bfdbfe'
                            }`,
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 
                              ticket.status === 'APPROVED' ? '#166534' :
                              ticket.status === 'REJECTED' ? '#991b1b' : '#1e40af',
                              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                              Resolution / LLM Assessment Notes
                            </div>
                            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: 
                              ticket.status === 'APPROVED' ? '#15803d' :
                              ticket.status === 'REJECTED' ? '#b91c1c' : '#1d4ed8' }}>
                              {ticket.resolution_notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {ticket.evidence_url ? (
                          <div style={{ border: '1px solid #e4e4e7', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase' }}>Evidence Image</div>
                            <a href={ticket.evidence_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 'fit-content' }}>
                              <img
                                src={ticket.evidence_url}
                                alt="Evidence Claim"
                                style={{
                                  maxHeight: 120,
                                  borderRadius: 8,
                                  border: '1.5px solid #e4e4e7',
                                  cursor: 'pointer',
                                  transition: 'transform 200ms',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                              />
                            </a>
                          </div>
                        ) : (
                          ticket.status === 'AWAITING_EVIDENCE' && (
                            <div style={{ border: '1.5px dashed #bfdbfe', borderRadius: 14, padding: '24px 16px', background: '#eff6ff', textAlign: 'center', color: '#1e40af' }}>
                              <span style={{ fontSize: 24, display: 'block', marginBottom: 6 }}>📷</span>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Awaiting Customer Evidence</p>
                              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#1d4ed8' }}>Customer must upload a photo in chat.</p>
                            </div>
                          )
                        )}

                        {['UNDER_REVIEW', 'AWAITING_EVIDENCE', 'REQUESTED', 'ELIGIBILITY_CHECK'].includes(ticket.status) && (
                          <div style={{ border: '1px solid #e4e4e7', borderRadius: 14, padding: 16, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase' }}>Actions</div>
                            <input
                              type="text"
                              placeholder="Resolution notes (optional)..."
                              value={ticketNotes[ticket.id] || ''}
                              onChange={(e) => setTicketNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '1.5px solid #e4e4e7',
                                fontSize: 13,
                                outline: 'none',
                              }}
                            />
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button
                                disabled={ticketActionLoading === ticket.id}
                                onClick={() => handleTicketAction(ticket.id, 'APPROVE')}
                                className="btn btn-primary btn-sm"
                                style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
                              >
                                Approve Refund
                              </button>
                              <button
                                disabled={ticketActionLoading === ticket.id}
                                onClick={() => handleTicketAction(ticket.id, 'REJECT')}
                                className="btn btn-outline btn-sm"
                                style={{ flex: 1, color: '#ef4444', borderColor: '#ef4444' }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DELETE MODAL ── */}
      {deletingProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            padding: 24,
            animation: 'fadeIn 200ms ease-out',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'white',
              borderRadius: 20,
              border: '1px solid #e4e4e7',
              padding: 32,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 16, textAlign: 'center' }}>⚠️</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
              Delete Product
            </h3>
            <p style={{ color: '#71717a', textAlign: 'center', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Are you sure you want to permanently delete <strong>{deletingProduct.title}</strong>? This will also delete all associated AI embeddings and cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setDeletingProduct(null)}
                disabled={deleteLoading}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                disabled={deleteLoading}
                className="btn btn-primary"
                style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444' }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editingProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            padding: 24,
            animation: 'fadeIn 200ms ease-out',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 680,
              background: 'white',
              borderRadius: 24,
              border: '1px solid #e4e4e7',
              padding: 32,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              margin: 'auto',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f4f4f5',
                paddingBottom: 16,
                marginBottom: 24,
              }}
            >
              <h3 style={{ fontSize: 22, fontWeight: 800 }}>Edit Product</h3>
              <button
                onClick={() => setEditingProduct(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#a1a1aa',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Image replace zone */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Product Image (Click to replace)
                </label>
                <div
                  onClick={() => editFileInputRef.current?.click()}
                  style={{
                    border: '1.5px dashed #e4e4e7',
                    borderRadius: 16,
                    padding: 16,
                    background: '#fafafa',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setEditFile(file);
                        setEditPreview(URL.createObjectURL(file));
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 72,
                      height: 90,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: '1px solid #e4e4e7',
                      background: '#f4f4f5',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={editPreview || editingProduct.image_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>
                      {editFile ? editFile.name : 'Using current product image'}
                    </p>
                    <p style={{ fontSize: 12, color: '#71717a', marginTop: 4 }}>
                      {editFile ? `${(editFile.size / 1024).toFixed(0)} KB` : 'Click to replace with a new image'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Product Title *
                </label>
                <input
                  required
                  value={editFormData.title}
                  onChange={(e) => setEditFormData(f => ({ ...f, title: e.target.value }))}
                  className="input"
                />
              </div>

              {/* Category + Gender row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Category *
                  </label>
                  <select
                    value={editFormData.category}
                    onChange={(e) => setEditFormData(f => ({ ...f, category: e.target.value }))}
                    className="input"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Gender *
                  </label>
                  <select
                    value={editFormData.gender}
                    onChange={(e) => setEditFormData(f => ({ ...f, gender: e.target.value }))}
                    className="input"
                  >
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Color + Price row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Color *
                  </label>
                  <input
                    required
                    value={editFormData.color}
                    onChange={(e) => setEditFormData(f => ({ ...f, color: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Price (৳) *
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={editFormData.price}
                    onChange={(e) => setEditFormData(f => ({ ...f, price: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>

              {/* Season + Usage */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Season
                  </label>
                  <select
                    value={editFormData.season}
                    onChange={(e) => setEditFormData(f => ({ ...f, season: e.target.value }))}
                    className="input"
                  >
                    <option value="">—</option>
                    {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Usage Type
                  </label>
                  <input
                    value={editFormData.usage_type}
                    onChange={(e) => setEditFormData(f => ({ ...f, usage_type: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Product Description
                </label>
                <textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="input"
                  style={{ resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
                />
              </div>

              {/* Visual Description */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Visual Description (Gemini AI sees this)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#9333ea', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={editFormData.regenerate_description}
                      onChange={(e) => setEditFormData(f => ({ ...f, regenerate_description: e.target.checked }))}
                      style={{ cursor: 'pointer' }}
                    />
                    Regenerate with Gemini Vision ✨
                  </label>
                </div>
                <textarea
                  value={editFormData.visual_description}
                  onChange={(e) => setEditFormData(f => ({ ...f, visual_description: e.target.value }))}
                  rows={3}
                  className="input"
                  style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}
                  disabled={editFormData.regenerate_description}
                  placeholder={editFormData.regenerate_description ? "Gemini will regenerate this based on the image upon saving..." : ""}
                />
              </div>

              {editError && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 10, fontSize: 13, color: '#991b1b' }}>
                  {editError}
                </div>
              )}

              {/* Form buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  borderTop: '1px solid #f4f4f5',
                  paddingTop: 16,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  disabled={editLoading}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="btn btn-primary"
                >
                  {editLoading ? 'Saving changes…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
