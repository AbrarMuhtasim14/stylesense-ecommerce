'use client';

import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { Product } from '@/lib/types';

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────
export interface CartItem {
  product: Product;
  quantity: number;
  size?: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; product: Product; size?: string }
  | { type: 'REMOVE_ITEM'; productId: number }
  | { type: 'UPDATE_QTY'; productId: number; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'TOGGLE_DRAWER'; open?: boolean }
  | { type: 'HYDRATE'; items: CartItem[] };

interface CartContextValue {
  state: CartState;
  addItem: (product: Product, size?: string) => void;
  removeItem: (productId: number) => void;
  updateQty: (productId: number, quantity: number) => void;
  clearCart: () => void;
  toggleDrawer: (open?: boolean) => void;
  itemCount: number;
  total: number;
}

// ──────────────────────────────────────────────
// REDUCER
// ──────────────────────────────────────────────
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: action.items };

    case 'ADD_ITEM': {
      const exists = state.items.find(
        (i) => i.product.id === action.product.id && i.size === action.size
      );
      if (exists) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.product.id === action.product.id && i.size === action.size
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { product: action.product, quantity: 1, size: action.size }],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.product.id !== action.productId),
      };

    case 'UPDATE_QTY':
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.product.id !== action.productId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.product.id === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      };

    case 'CLEAR':
      return { ...state, items: [] };

    case 'TOGGLE_DRAWER':
      return { ...state, isOpen: action.open !== undefined ? action.open : !state.isOpen };

    default:
      return state;
  }
}

// ──────────────────────────────────────────────
// CONTEXT
// ──────────────────────────────────────────────
const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'stylesense_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false });

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored) as CartItem[];
        dispatch({ type: 'HYDRATE', items });
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // ignore
    }
  }, [state.items]);

  const addItem = (product: Product, size?: string) =>
    dispatch({ type: 'ADD_ITEM', product, size });

  const removeItem = (productId: number) => dispatch({ type: 'REMOVE_ITEM', productId });

  const updateQty = (productId: number, quantity: number) =>
    dispatch({ type: 'UPDATE_QTY', productId, quantity });

  const clearCart = () => dispatch({ type: 'CLEAR' });

  const toggleDrawer = (open?: boolean) => dispatch({ type: 'TOGGLE_DRAWER', open });

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const total = state.items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{ state, addItem, removeItem, updateQty, clearCart, toggleDrawer, itemCount, total }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
