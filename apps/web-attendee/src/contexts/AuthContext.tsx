import { createContext, useContext, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import type { AuthUser, LoginResponseData } from '@eventflow/types';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user, accessToken, setAuth, clearAuth } = useAuthStore();

  const login = async (email: string, password: string): Promise<void> => {
    const res = await api.post<{ data: LoginResponseData }>('/auth/login', { email, password });
    setAuth({ user: res.data.data.user, accessToken: res.data.data.tokens.accessToken });
  };

  const logout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
