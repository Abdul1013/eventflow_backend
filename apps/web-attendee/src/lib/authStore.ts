import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@eventflow/types';

// ─── Store shape ──────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setAuth: (data: Partial<Pick<AuthState, 'user' | 'accessToken'>>) => void;
  clearAuth: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (data) => set((s) => ({ ...s, ...data })),
      clearAuth: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'ef-attendee-auth',
      // sessionStorage: cleared when tab closes, not shared between tabs
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);
