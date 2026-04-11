import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './authStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  withCredentials: true, // sends the HttpOnly refreshToken cookie
});

// ─── Request interceptor — inject Bearer token ────────────────────────────────

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor — silent token refresh on 401 ──────────────────────

type QueuedRequest = {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
};

let isRefreshing = false;
let waitQueue: QueuedRequest[] = [];

const drainQueue = (err: unknown, token: string | null): void => {
  waitQueue.forEach(({ resolve, reject }) => (err ? reject(err) : resolve(token!)));
  waitQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh for 401s on non-refresh endpoints and only once per request
    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url === '/auth/refresh'
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request until the in-flight refresh completes
      return new Promise((resolve, reject) => {
        waitQueue.push({ resolve, reject });
      }).then((newToken) => {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      type RefreshData = { data: { accessToken: string } };
      const res = await api.post<RefreshData>('/auth/refresh');
      const newToken = res.data.data.accessToken;
      useAuthStore.getState().setAuth({ accessToken: newToken });
      drainQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(refreshErr, null);
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
