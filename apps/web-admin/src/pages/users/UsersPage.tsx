import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import type { Role } from '@eventflow/types';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

type ApiResp<T> = {
  success: boolean;
  data: T;
  meta?: { page: number; total: number; limit: number };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: Role[] = ['ADMIN', 'STAFF', 'ATTENDEE'];

const ROLE_BADGE: Record<Role, string> = {
  ADMIN:    'bg-red-100 text-red-700',
  STAFF:    'bg-indigo-100 text-indigo-700',
  ATTENDEE: 'bg-gray-100 text-gray-600',
};

const LIMIT = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Pending role change
  const [roleDialog, setRoleDialog] = useState<{
    user: UserRow;
    newRole: Role;
  } | null>(null);

  // ── Fetch users
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () =>
      api
        .get<ApiResp<UserRow[]>>(`/admin/users?page=${page}&limit=${LIMIT}`)
        .then((r) => ({ users: r.data.data, meta: r.data.meta })),
    staleTime: 30_000,
  });

  // ── Update role
  const { mutate: updateRole, isPending: isUpdating } = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setRoleDialog(null);
    },
  });

  const users = data?.users ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT) || 1;

  const rows = users.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Users"
        subtitle={`${total || '…'} registered users`}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between text-sm text-red-700">
          <span>Failed to load users.</span>
          <button onClick={() => void refetch()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Name', 'Email', 'Role', 'Joined', 'Change Role'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        {user.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[user.role]}`}
                      >
                        {user.role === 'ADMIN' && <ShieldCheck size={11} />}
                        {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) =>
                          setRoleDialog({ user, newRole: e.target.value as Role })
                        }
                        className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0) + r.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  {search ? `No users matching "${search}"` : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {page} of {totalPages} · {total} users
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Role change confirmation dialog */}
      <ConfirmDialog
        open={roleDialog !== null}
        onOpenChange={(open) => { if (!open) setRoleDialog(null); }}
        title="Change user role"
        description={
          roleDialog
            ? `Change ${roleDialog.user.name}'s role from ${roleDialog.user.role} to ${roleDialog.newRole}?`
            : undefined
        }
        confirmLabel="Update Role"
        danger={roleDialog?.newRole === 'ADMIN'}
        isPending={isUpdating}
        onConfirm={() => {
          if (roleDialog) {
            updateRole({ userId: roleDialog.user.id, role: roleDialog.newRole });
          }
        }}
      />
    </div>
  );
}
