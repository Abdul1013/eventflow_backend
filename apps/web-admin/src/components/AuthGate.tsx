import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/lib/authStore';
import { isTokenExpired, isTokenExpiringSoon } from '@/lib/tokenUtils';
import { api } from '@/lib/api';
import { Spinner } from '@eventflow/ui';

/**
 * Layout route that enforces authentication.
 *
 * • No token / expired  → redirect to /login?redirect=<current path>
 * • Token expiring < 120 s → silently refresh before rendering children
 * • Valid token          → render <Outlet />
 */
export function AuthGate() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  // If the token is already expiring on mount, start in refreshing state so we
  // show a spinner immediately instead of briefly flashing protected content.
  const [isRefreshing, setIsRefreshing] = useState(() => {
    const token = useAuthStore.getState().accessToken;
    return !!(token && !isTokenExpired(token) && isTokenExpiringSoon(token, 120));
  });

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token || isTokenExpired(token) || !isTokenExpiringSoon(token, 120)) return;

    setIsRefreshing(true);
    api
      .post<{ data: { accessToken: string } }>('/auth/refresh')
      .then((res) => {
        useAuthStore.getState().setAuth({ accessToken: res.data.data.accessToken });
      })
      .catch(() => {
        // api interceptor also clears auth on 401; belt-and-suspenders here
        useAuthStore.getState().clearAuth();
      })
      .finally(() => setIsRefreshing(false));
  }, []); // intentional: proactive refresh runs once on mount

  const redirect = encodeURIComponent(location.pathname + location.search);

  if (!accessToken || isTokenExpired(accessToken)) {
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (isRefreshing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <Outlet />;
}
