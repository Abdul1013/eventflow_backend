import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/src/store/authStore';
import { api } from '@/src/lib/api';
import { startNetworkListener, stopNetworkListener } from '@/src/lib/networkListener';
import { initQueue } from '@/src/lib/offlineQueue';
import type { AuthUser } from '@eventflow/types';

// ─── Auth gate 

function AuthGate({ children }: { children: React.ReactNode }) {
  const { accessToken, setAuth, clearAuth } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // On launch, silently attempt a token refresh to extend the session
  useEffect(() => {
    if (!accessToken) return;
    api
      .post<{ data: { accessToken: string; user: AuthUser } }>('/auth/refresh')
      .then((res) => {
        setAuth({ accessToken: res.data.data.accessToken, user: res.data.data.user });
      })
      .catch(() => clearAuth());
    // Run once on mount — intentionally omitting deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route guard: redirect unauthenticated users to login, authenticated away from auth screens
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)/scanner');
    }
  }, [accessToken, segments, router]);

  return <>{children}</>;
}

// ─── Root layout 
// GestureHandlerRootView must wrap the entire app tree for @gorhom/bottom-sheet
// and other gesture-based components to work correctly.
// Toast must render above all other content — placed as the last child of the root.

export default function RootLayout() {
  useEffect(() => {
    initQueue().catch((err) => console.error('[OfflineQueue] Init failed', err));
    startNetworkListener();
    return stopNetworkListener;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGate>
      <Toast />
    </GestureHandlerRootView>
  );
}
