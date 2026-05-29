// Product types
export interface Product {
  id: number;
  title: string;
  description: string;
  visual_description: string | null;
  price: number;
  category: string;
  sub_category: string | null;
  color: string;
  gender: string;
  season: string | null;
  usage_type: string | null;
  image_url: string;
  is_corrupted: boolean;
  original_name: string | null;
  created_at: string;
}

export interface ProductWithScore extends Product {
  similarity_score: number;
  visual_similarity?: number;
  text_match?: number;
  is_vision_match?: boolean;
}

export interface Category {
  name: string;
  count: number;
  display_order?: number;
}

// Search types
export interface SearchFilters {
  category?: string;
  gender?: string;
  color?: string;
  min_price?: number;
  max_price?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: ProductWithScore[];
  query: string;
  search_type: 'text' | 'image' | 'combined';
  total: number;
}

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  products?: Product[];
  timestamp?: Date;
}

export interface ChatRequest {
  message: string;
  session_id: string;
  product_id?: number;
  customer_email?: string;
  customer_name?: string;
}

export interface ChatResponse {
  reply: string;
  products?: Product[];
  session_id: string;
}

// Order types
export interface Order {
  id: string;
  product_id: number;
  customer_name: string;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
  product?: Product;
}

// Admin types
export interface AdminUploadPayload {
  title: string;
  category: string;
  color: string;
  gender: string;
  price: number;
  description?: string;
  sub_category?: string;
  season?: string;
  usage_type?: string;
}

export interface UploadResponse {
  product: Product;
  visual_description: string;
}

// Health types
export interface HealthStatus {
  status: string;
  database: boolean;
  clip_model: boolean;
  gemini: boolean;
}
