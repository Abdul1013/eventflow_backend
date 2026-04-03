import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoadingSpinner } from '@eventflow/ui';
import { AuthGate } from '@/components/AuthGate';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import AttendeeShellLayout from '@/layouts/AttendeeShellLayout';

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────

const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const EventsPage         = lazy(() => import('@/pages/events/EventsPage'));
const EventDetailPage    = lazy(() => import('@/pages/events/EventDetailPage'));
const MyTicketsPage      = lazy(() => import('@/pages/tickets/MyTicketsPage'));
const TicketDetailPage   = lazy(() => import('@/pages/tickets/TicketDetailPage'));
const ProfilePage        = lazy(() => import('@/pages/profile/ProfilePage'));
const AppNotFoundPage    = lazy(() => import('@/pages/NotFoundPage'));

// ─── Helper: wrap a lazy page in Suspense ────────────────────────────────────

function page(element: React.ReactNode) {
  return <Suspense fallback={<LoadingSpinner />}>{element}</Suspense>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Root redirect
  { path: '/', element: <Navigate to="/events" replace /> },

  // ── Auth routes (no shell) ──
  { path: '/login',           element: <LoginPage /> },
  { path: '/register',        element: <RegisterPage /> },
  { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
  { path: '/reset-password',  element: page(<ResetPasswordPage />) },

  // ── Shell-wrapped routes ──
  {
    element: <AttendeeShellLayout />,
    children: [
      // Public
      { path: '/events',     element: page(<EventsPage />) },
      { path: '/events/:id', element: page(<EventDetailPage />) },

      // Protected — nested AuthGate inside the shell
      {
        element: <AuthGate />,
        children: [
          { path: '/my-tickets',     element: page(<MyTicketsPage />) },
          { path: '/my-tickets/:id', element: page(<TicketDetailPage />) },
          { path: '/profile',        element: page(<ProfilePage />) },
        ],
      },
    ],
  },

  // ── Catch-all ──
  { path: '*', element: page(<AppNotFoundPage />) },
]);
