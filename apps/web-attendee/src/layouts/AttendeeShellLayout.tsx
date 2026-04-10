import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AttendeeShell, type AttendeeNavItem } from '@eventflow/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function AttendeeShellLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: AttendeeNavItem[] = [
    {
      href: '/events',
      label: 'Events',
      active: location.pathname.startsWith('/events'),
      onClick: (e) => { e.preventDefault(); navigate('/events'); },
    },
    ...(user
      ? [
          {
            href: '/my-tickets',
            label: 'My Tickets',
            active: location.pathname.startsWith('/my-tickets'),
            onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              navigate('/my-tickets');
            },
          },
        ]
      : []),
  ];

  return (
    <AttendeeShell
      navItems={navItems}
      user={user}
      onLogout={() => { void logout(); }}
    >
      <Outlet />
    </AttendeeShell>
  );
}
