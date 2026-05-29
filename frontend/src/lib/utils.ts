import type { Product } from './types';

// ──────────────────────────────────────────────
// FORMATTERS
// ──────────────────────────────────────────────
export function formatPrice(price: number): string {
  return `৳${price.toLocaleString('en-IN')}`;
}

export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr));
}

// ──────────────────────────────────────────────
// PRODUCT HELPERS
// ──────────────────────────────────────────────
export function getProductImage(product: Product): string {
  if (product.image_url && product.image_url.startsWith('http')) {
    return product.image_url;
  }
  return '/placeholder-product.png';
}

export function getProductTitle(product: Product): string {
  // Show original name for corrupted products in admin, actual title elsewhere
  return product.title;
}

export function isVisionMatch(
  visualScore: number,
  textScore: number,
  threshold = 0.15
): boolean {
  // Badge triggers when visual similarity is significantly higher than text similarity
  return visualScore - textScore > threshold;
}

// ──────────────────────────────────────────────
// COLOR HELPERS
// ──────────────────────────────────────────────
const colorMap: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  purple: '#a855f7',
  pink: '#ec4899',
  black: '#18181b',
  white: '#f4f4f5',
  grey: '#71717a',
  gray: '#71717a',
  brown: '#92400e',
  navy: '#1e3a5f',
  beige: '#d4a96a',
  cream: '#fef9c3',
  maroon: '#7f1d1d',
  teal: '#14b8a6',
  mint: '#6ee7b7',
  lavender: '#c4b5fd',
  khaki: '#c3b489',
  olive: '#84876d',
  coral: '#fb7185',
  turquoise: '#22d3ee',
  silver: '#d1d5db',
  gold: '#f59e0b',
  multicolor: 'linear-gradient(135deg, #ef4444, #3b82f6, #22c55e)',
};

export function getColorSwatch(color: string | null | undefined): string {
  if (!color) return '#e4e4e7'; // default gray for missing color
  const normalized = color.toLowerCase().trim();
  
  for (const [key, value] of Object.entries(colorMap)) {
    if (normalized.includes(key)) return value;
  }
  return '#a1a1aa';
}

// ──────────────────────────────────────────────
// SEARCH HELPERS
// ──────────────────────────────────────────────
export function buildSearchParams(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, String(val));
    }
  });
  return searchParams.toString();
}

// ──────────────────────────────────────────────
// STRING HELPERS
// ──────────────────────────────────────────────
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trimEnd() + '…';
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

// ──────────────────────────────────────────────
// ID HELPERS
// ──────────────────────────────────────────────
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ──────────────────────────────────────────────
// CATEGORY ICONS
// ──────────────────────────────────────────────
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'Topwear': '👕',
    'T-Shirts': '👕',
    'Shirts': '👔',
    'Sweaters': '🧥',
    'Jackets': '🧥',
    'Bottomwear': '👖',
    'Jeans': '👖',
    'Trousers': '👖',
    'Shorts': '🩳',
    'Dresses': '👗',
    'Kurtas': '👘',
    'Ethnic': '👘',
    'Footwear': '👟',
    'Shoes': '👟',
    'Sneakers': '👟',
    'Bags': '👜',
    'Watches': '⌚',
    'Sunglasses': '🕶️',
    'Accessories': '💍',
    'Sportswear': '🏃',
  };

  for (const [key, icon] of Object.entries(icons)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return '🛍️';
}

// ──────────────────────────────────────────────
// SIZES
// ──────────────────────────────────────────────
export function getSizesForCategory(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes('shoe') || cat.includes('sneaker') || cat.includes('footwear')) {
    return ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
  }
  if (cat.includes('bag') || cat.includes('watch') || cat.includes('sunglass')) {
    return ['One Size'];
  }
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
}

// ──────────────────────────────────────────────
// SCORE GRADIENT
// ──────────────────────────────────────────────
export function getScoreColor(score: number): string {
  if (score >= 0.8) return '#22c55e';
  if (score >= 0.6) return '#d946ef';
  if (score >= 0.4) return '#f59e0b';
  return '#94a3b8';
}
