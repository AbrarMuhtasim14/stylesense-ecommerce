'use client';

export interface User {
  email: string;
  name: string;
}

/**
 * Retrieves the current logged in user from localStorage.
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const userStr = localStorage.getItem('stylelence_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch (e) {
    console.error('Failed to parse user session', e);
    return null;
  }
}

/**
 * Logs in the user (mocks backend call and saves to localStorage).
 */
export async function login(email: string, name: string): Promise<User> {
  // Simulate network request latency
  await new Promise((resolve) => setTimeout(resolve, 600));

  const user: User = { email, name };
  if (typeof window !== 'undefined') {
    localStorage.setItem('stylelence_user', JSON.stringify(user));
    // Trigger global event so Navbar and other parts of the app sync state immediately
    window.dispatchEvent(new CustomEvent('auth-state-change', { detail: user }));
  }
  return user;
}

/**
 * Signs up the user (mocks backend call and saves to localStorage).
 */
export async function signup(email: string, name: string): Promise<User> {
  // Simulate network request latency
  await new Promise((resolve) => setTimeout(resolve, 600));

  const user: User = { email, name };
  if (typeof window !== 'undefined') {
    localStorage.setItem('stylelence_user', JSON.stringify(user));
    // Trigger global event
    window.dispatchEvent(new CustomEvent('auth-state-change', { detail: user }));
  }
  return user;
}

/**
 * Clears the session from localStorage.
 */
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('stylelence_user');
    // Trigger global event
    window.dispatchEvent(new CustomEvent('auth-state-change', { detail: null }));
  }
}
