import type {
  Product,
  ProductWithScore,
  Category,
  SearchFilters,
  SearchResponse,
  ChatRequest,
  ChatResponse,
  HealthStatus,
  UploadResponse,
  AdminUploadPayload,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7860';

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ──────────────────────────────────────────────
// HEALTH
// ──────────────────────────────────────────────
export async function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>('/health');
}

// ──────────────────────────────────────────────
// PRODUCTS
// ──────────────────────────────────────────────
export async function getProducts(filters: SearchFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.color) params.set('color', filters.color);
  if (filters.min_price !== undefined) params.set('min_price', String(filters.min_price));
  if (filters.max_price !== undefined) params.set('max_price', String(filters.max_price));
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));

  const query = params.toString();
  const res = await apiFetch<{ products: Product[]; total: number }>(`/products${query ? `?${query}` : ''}`);
  return res.products || [];
}

export async function getProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`);
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/products/categories');
}

export async function getSimilarProducts(id: number, limit = 8): Promise<ProductWithScore[]> {
  const res = await apiFetch<{ products: ProductWithScore[]; total: number }>(`/products/${id}/similar?limit=${limit}`);
  return res.products || [];
}

// ──────────────────────────────────────────────
// SEARCH
// ──────────────────────────────────────────────
export async function searchByText(
  query: string,
  filters: SearchFilters = {}
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>('/search/text', {
    method: 'POST',
    body: JSON.stringify({
      query,
      ...filters,
    }),
  });
}

export async function searchByImage(
  imageFile: File,
  textQuery?: string,
  filters: SearchFilters = {}
): Promise<SearchResponse> {
  const form = new FormData();
  form.append('image', imageFile);
  if (textQuery) form.append('text_query', textQuery);
  if (filters.category) form.append('category', filters.category);
  if (filters.gender) form.append('gender', filters.gender);
  if (filters.limit !== undefined) form.append('limit', String(filters.limit));

  const res = await fetch(`${API_BASE}/search/image`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<SearchResponse>;
}

// ──────────────────────────────────────────────
// AGENT / CHAT
// ──────────────────────────────────────────────
export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const res = await apiFetch<any>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return {
    reply: res.reply,
    session_id: res.session_id,
    products: res.suggested_products,
  };
}

export async function uploadEvidence(imageFile: File): Promise<{ evidence_url: string }> {
  const form = new FormData();
  form.append('image', imageFile);

  const res = await fetch(`${API_BASE}/agent/upload_evidence`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload evidence');
  }

  return res.json();
}

// ──────────────────────────────────────────────
// ADMIN
// ──────────────────────────────────────────────
export async function adminUpload(
  imageFile: File,
  payload: AdminUploadPayload,
  password: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('image', imageFile);

  // Append all metadata fields
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  });

  const res = await fetch(`${API_BASE}/admin/upload`, {
    method: 'POST',
    headers: {
      'X-Admin-Password': password,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Admin upload failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<UploadResponse>;
}

export async function getAdminProducts(password: string): Promise<Product[]> {
  const res = await apiFetch<{ products: Product[]; total: number }>('/products?limit=200', {
    headers: {
      'X-Admin-Password': password,
    },
  });
  return res.products || [];
}

export async function adminDeleteProduct(id: number, password: string): Promise<{ message: string; id: number }> {
  const res = await fetch(`${API_BASE}/admin/products/${id}`, {
    method: 'DELETE',
    headers: {
      'X-Admin-Password': password,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Admin delete failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{ message: string; id: number }>;
}

export async function adminUpdateProduct(
  id: number,
  formData: FormData,
  password: string
): Promise<Product> {
  const res = await fetch(`${API_BASE}/admin/products/${id}`, {
    method: 'PATCH',
    headers: {
      'X-Admin-Password': password,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Admin update failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<Product>;
}

export async function getTickets(password?: string, status?: string): Promise<any[]> {
  const adminPassword = password || localStorage.getItem('stylesense_admin_pw') || localStorage.getItem('admin_password');
  if (!adminPassword) throw new Error('Not authenticated');

  const query = status ? `?status=${status}` : '';
  const res = await apiFetch<{tickets: any[]}>(`/admin/tickets${query}`, {
    headers: {
      'X-Admin-Password': adminPassword,
    },
  });
  return res.tickets;
}

export async function updateTicketStatus(
  ticketId: number,
  action: 'APPROVE' | 'REJECT' | 'ESCALATE',
  resolutionNotes: string = '',
  password?: string
): Promise<any> {
  const adminPassword = password || localStorage.getItem('stylesense_admin_pw') || localStorage.getItem('admin_password');
  if (!adminPassword) throw new Error('Not authenticated');

  return apiFetch<any>(`/admin/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ action, resolution_notes: resolutionNotes }),
  });
}

// ──────────────────────────────────────────────
// ADMIN ORDERS
// ──────────────────────────────────────────────
export async function getAdminOrders(password: string, status?: string): Promise<any[]> {
  const query = status ? `?status=${status}` : '';
  const res = await apiFetch<{ orders: any[] }>(`/admin/orders${query}`, {
    headers: {
      'X-Admin-Password': password,
    },
  });
  return res.orders || [];
}

export async function updateOrderStatus(
  orderNumber: string,
  status: string,
  password: string
): Promise<any> {
  return apiFetch<any>(`/admin/orders/${orderNumber}`, {
    method: 'PATCH',
    headers: {
      'X-Admin-Password': password,
    },
    body: JSON.stringify({ status }),
  });
}


// ──────────────────────────────────────────────
// ORDERS / CHECKOUT
// ──────────────────────────────────────────────
export interface CheckoutItem {
  product_id: number;
  quantity: number;
  size?: string;
}

export interface CheckoutRequest {
  customer_name: string;
  customer_email: string;
  shipping_address: string;
  items: CheckoutItem[];
}

export interface OrderResponse {
  order_number: string;
  status: string;
  total_price: number;
  message: string;
}

export async function createOrder(req: CheckoutRequest): Promise<OrderResponse> {
  return apiFetch<OrderResponse>('/orders/checkout', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getMyOrders(email: string): Promise<any[]> {
  const res = await apiFetch<{ orders: any[] }>(`/orders/my-orders?email=${encodeURIComponent(email)}`);
  return res.orders || [];
}
