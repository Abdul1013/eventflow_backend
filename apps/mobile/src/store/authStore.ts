import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '@eventflow/types';

// ─── Secure storage adapter for Zustand persist ───────────────────────────────

const secureStorage = createJSONStorage<AuthState>(() => ({
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
}));

// ─── Store types ──────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setAuth: (data: { user: AuthUser; accessToken: string }) => void;
  clearAuth: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (data) => set(data),
      clearAuth: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'ef-staff-auth',
      storage: secureStorage,
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);
