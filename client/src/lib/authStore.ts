import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'dispatcher';
  pharmacyId: number | null;
  pharmacyName?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: (user: AuthUser) => set({ user, isAuthenticated: true, isLoading: false }),
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
          console.error('Logout error:', err);
        }
        set({ user: null, isAuthenticated: false, isLoading: false });
      },
      checkSession: async () => {
        try {
          const response = await fetch('/api/auth/me');
          if (response.ok) {
            const data = await response.json();
            set({ user: data.user, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (err) {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
