import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, Pencil, Trash2, CalendarOff, Play, StopCircle, XCircle } from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import type { AdminEventListItem } from '@eventflow/types';
import { StatusBadge } from '@eventflow/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { api } from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ApiResp<T> = { success: boolean; data: T };

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function sumTickets(tts: AdminEventListItem['ticketTypes']) {
  return tts.reduce((acc, tt) => ({ sold: acc.sold + tt.quantitySold, total: acc.total + tt.quantityTotal }), { sold: 0, total: 0 });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('startsAt');
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ id: string; title: string; nextStatus: string; label: string; danger?: boolean } | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  const params = new URLSearchParams({
    page: String(page), limit: '20',
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status ? { status } : {}),
    sort,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-events', { page, search: debouncedSearch, status, sort }],
    queryFn: () =>
      api.get<ApiResp<{ events: AdminEventListItem[]; total: number; page: number; limit: number }>>(`/events?${params}`)
        .then(r => r.data.data),
    staleTime: 15_000,
  });

  const { mutate: deleteEvent, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      setDeleteTarget(null);
      showToast('Event deleted successfully');
    },
  });

  const { mutate: changeStatus, isPending: isChangingStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/events/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      setStatusTarget(null);
      showToast('Event status updated');
    },
  });

  // Primary forward transition for each status (shown as an inline button)
  const STATUS_ADVANCE: Partial<Record<string, { nextStatus: string; label: string; Icon: React.ElementType; danger?: boolean }>> = {
    DRAFT:     { nextStatus: 'PUBLISHED', label: 'Publish',    Icon: Play },
    PUBLISHED: { nextStatus: 'ONGOING',   label: 'Go Live',    Icon: Play },
    ONGOING:   { nextStatus: 'ENDED',     label: 'End Event',  Icon: StopCircle, danger: true },
  };

  const events = data?.events ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <PageHeader
        title="Events"
        subtitle={data ? `${data.total.toLocaleString()} event${data.total !== 1 ? 's' : ''}` : undefined}
        actions={
          <Link
            to="/events/new"
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus size={16} />
            Create Event
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <Select.Root value={status} onValueChange={v => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}>
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <Select.Value placeholder="All Statuses" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg">
              <Select.Viewport className="p-1">
                {['ALL', 'DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED'].map(s => (
                  <Select.Item key={s} value={s} className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none data-[highlighted]:bg-indigo-50">
                    <Select.ItemText>{s === 'ALL' ? 'All Statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root value={sort} onValueChange={setSort}>
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg">
              <Select.Viewport className="p-1">
                <Select.Item value="startsAt" className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none data-[highlighted]:bg-indigo-50">
                  <Select.ItemText>Start Date</Select.ItemText>
                </Select.Item>
                <Select.Item value="createdAt" className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none data-[highlighted]:bg-indigo-50">
                  <Select.ItemText>Created Date</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between text-sm text-red-700">
          <span>Failed to load events.</span>
          <button onClick={() => void refetch()} className="font-medium underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Event', 'Date', 'Venue', 'Tickets', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className={`h-4 rounded bg-gray-100 ${j === 0 ? 'w-48' : 'w-24'}`} />
                    </td>
                  ))}
                </tr>
              ))
              : events.map(ev => {
                const tickets = sumTickets(ev.ticketTypes);
                const canDelete = ev.status === 'DRAFT' || ev.status === 'CANCELLED';
                const advance = STATUS_ADVANCE[ev.status];
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {ev.bannerUrl
                          ? <img src={ev.bannerUrl} alt="" className="w-12 h-8 object-cover rounded shrink-0" />
                          : <div className="w-12 h-8 rounded bg-indigo-100 shrink-0" />}
                        <div>
                          <p className="font-medium text-gray-900 truncate max-w-48">{ev.title}</p>
                          <p className="text-xs text-gray-400 truncate max-w-48">
                            {ev.description.length > 60 ? ev.description.slice(0, 60) + '…' : ev.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(ev.startsAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{ev.venue?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {tickets.total > 0 ? `${tickets.sold} / ${tickets.total}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ev.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/events/${ev.id}`)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          title="View"
                        >
                          <Eye size={15} />
                        </button>
                        {ev.status === 'DRAFT' && (
                          <button
                            onClick={() => navigate(`/events/${ev.id}/edit`)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {advance && (
                          <button
                            onClick={() => setStatusTarget({ id: ev.id, title: ev.title, nextStatus: advance.nextStatus, label: advance.label, danger: advance.danger })}
                            className={`p-1.5 rounded focus:outline-none focus:ring-2 ${advance.danger ? 'hover:bg-red-50 text-red-500 focus:ring-red-500' : 'hover:bg-emerald-50 text-emerald-600 focus:ring-emerald-500'}`}
                            title={advance.label}
                          >
                            <advance.Icon size={15} />
                          </button>
                        )}
                        {ev.status === 'PUBLISHED' && (
                          <button
                            onClick={() => setStatusTarget({ id: ev.id, title: ev.title, nextStatus: 'CANCELLED', label: 'Cancel Event', danger: true })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                            title="Cancel Event"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget({ id: ev.id, title: ev.title })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

            {!isLoading && events.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={CalendarOff}
                    title="No events found"
                    description={debouncedSearch || status ? 'Try adjusting your filters.' : undefined}
                    action={
                      !debouncedSearch && !status ? (
                        <Link to="/events/new" className="text-indigo-600 text-sm hover:underline font-medium">
                          Create your first event
                        </Link>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Next
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Delete Event"
        description={deleteTarget ? `This will permanently remove "${deleteTarget.title}". This cannot be undone.` : undefined}
        confirmLabel="Delete Event"
        danger
        isPending={isDeleting}
        onConfirm={() => { if (deleteTarget) deleteEvent(deleteTarget.id); }}
      />

      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={open => { if (!open) setStatusTarget(null); }}
        title={statusTarget?.label ?? ''}
        description={statusTarget ? `Are you sure you want to ${statusTarget.label.toLowerCase()} "${statusTarget.title}"?` : undefined}
        confirmLabel={statusTarget?.label ?? ''}
        danger={statusTarget?.danger}
        isPending={isChangingStatus}
        onConfirm={() => { if (statusTarget) changeStatus({ id: statusTarget.id, status: statusTarget.nextStatus }); }}
      />
    </div>
  );
}
