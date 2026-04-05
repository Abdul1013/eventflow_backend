import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoadingSpinner } from '@eventflow/ui';
import { AuthGate } from '@/components/AuthGate';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import AdminShellLayout from '@/layouts/AdminShellLayout';

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────

const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage      = lazy(() => import('@/pages/dashboard/DashboardPage'));
const EventListPage      = lazy(() => import('@/pages/events/EventListPage'));
const CreateEventPage    = lazy(() => import('@/pages/events/CreateEventPage'));
const EventDetailPage    = lazy(() => import('@/pages/events/EventDetailPage'));
const EditEventPage      = lazy(() => import('@/pages/events/EditEventPage'));
const VenuesPage         = lazy(() => import('@/pages/venues/VenuesPage'));
const CreateVenuePage    = lazy(() => import('@/pages/venues/CreateVenuePage'));
const UsersPage          = lazy(() => import('@/pages/users/UsersPage'));
const AppNotFoundPage    = lazy(() => import('@/pages/NotFoundPage'));

// ─── Helper: wrap a lazy page in Suspense ────────────────────────────────────

function page(element: React.ReactNode) {
  return <Suspense fallback={<LoadingSpinner />}>{element}</Suspense>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  { path: '/login',           element: <LoginPage /> },
  { path: '/register',        element: <RegisterPage /> },
  { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
  { path: '/reset-password',  element: page(<ResetPasswordPage />) },

  {
    element: <AuthGate />,
    children: [
      {
        element: <AdminShellLayout />,
        children: [
          { path: '/',                element: page(<DashboardPage />) },
          { path: '/events',          element: page(<EventListPage />) },
          { path: '/events/new',      element: page(<CreateEventPage />) },
          { path: '/events/:id',      element: page(<EventDetailPage />) },
          { path: '/events/:id/edit', element: page(<EditEventPage />) },
          { path: '/venues',          element: page(<VenuesPage />) },
          { path: '/venues/new',      element: page(<CreateVenuePage />) },
          { path: '/users',           element: page(<UsersPage />) },
        ],
      },
    ],
  },

  { path: '/404', element: page(<AppNotFoundPage />) },
  { path: '*',    element: <Navigate to="/404" replace /> },
]);
