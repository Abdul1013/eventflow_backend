import axios from 'axios';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import type { AuthUser } from '@eventflow/types';

//  Types 

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

//  Refresh state 

let isRefreshing = false;
let waitQueue: QueuedRequest[] = [];

const drainQueue = (token: string | null, err?: unknown): void => {
  waitQueue.forEach((req) => (token ? req.resolve(token) : req.reject(err)));
  waitQueue = [];
};

//  Axios instance

export const api = axios.create({
  // baseURL: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3000/api/v1',
  baseURL: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'https://eventflow-api-n9a7.onrender.com/api/v1',
  withCredentials: true,
});

//  Request interceptor — inject Bearer token

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

//  Response interceptor — refresh on 401, retry once 

type AxiosConfigWithRetry = (typeof api.defaults) & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    const axiosErr = err as {
      response?: { status: number };
      config: AxiosConfigWithRetry;
    };
    const original = axiosErr.config;

    if (axiosErr.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    original._retry = true;

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waitQueue.push({
          resolve: (token) => {
            original.headers = original.headers ?? {};
            (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;
    try {
      const res = await api.post<{
        data: { accessToken: string; user: AuthUser };
      }>('/auth/refresh');
      const newToken = res.data.data.accessToken;
      const { user } = useAuthStore.getState();
      useAuthStore.getState().setAuth({ user: user!, accessToken: newToken });

      drainQueue(newToken);
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      useAuthStore.getState().clearAuth();
      router.replace('/(auth)/login');
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
