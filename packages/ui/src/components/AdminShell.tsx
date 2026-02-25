import { type MouseEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  /**
   * Optional click handler — if provided the default anchor navigation is
   * suppressed, allowing the consuming app to use its own router (e.g.
   * react-router-dom's `navigate`).
   */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export interface AdminShellProps {
  navItems: NavItem[];
  /** Small subtitle shown next to the logo (e.g. "Admin"). */
  title?: string;
  user: { name: string; email: string };
  onLogout: () => void;
  children: ReactNode;
}

export function AdminShell({
  navItems,
  title,
  user,
  onLogout,
  children,
}: AdminShellProps) {
  const initials = user.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-baseline gap-2">
          <span className="text-lg font-bold text-indigo-600">EventFlow</span>
          {title && (
            <span className="text-xs text-gray-400 font-normal">{title}</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={item.onClick}
              className={twMerge(
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  item.active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ),
              )}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-3 px-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
