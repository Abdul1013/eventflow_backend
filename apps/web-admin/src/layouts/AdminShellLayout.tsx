import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, MapPin, Users } from 'lucide-react';
import { AdminShell, type NavItem } from '@eventflow/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminShellLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      href: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard size={18} />,
      active: location.pathname === '/',
      onClick: (e) => { e.preventDefault(); navigate('/'); },
    },
    {
      href: '/events',
      label: 'Events',
      icon: <Calendar size={18} />,
      active: location.pathname.startsWith('/events'),
      onClick: (e) => { e.preventDefault(); navigate('/events'); },
    },
    {
      href: '/venues',
      label: 'Venues',
      icon: <MapPin size={18} />,
      active: location.pathname.startsWith('/venues'),
      onClick: (e) => { e.preventDefault(); navigate('/venues'); },
    },
    {
      href: '/users',
      label: 'Users',
      icon: <Users size={18} />,
      active: location.pathname.startsWith('/users'),
      onClick: (e) => { e.preventDefault(); navigate('/users'); },
    },
  ];

  return (
    <AdminShell 
      navItems={navItems}
      title="Admin"
      user={{ name: user?.name ?? '', email: user?.email ?? '' }}
      onLogout={() => { void logout(); }}
    >
      <Outlet />
    </AdminShell>
  );
}
