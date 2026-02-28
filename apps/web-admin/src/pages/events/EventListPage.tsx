import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, Pencil, Trash2, CalendarOff } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import type { AdminEventListItem } from '@eventflow/types';
import { StatusBadge } from '@eventflow/ui';
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

// ─── Delete dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  eventId: string;
  eventTitle: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}

function DeleteDialog({ eventId, eventTitle, open, onOpenChange, onDeleted }: DeleteDialogProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.delete(`/events/${eventId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      onOpenChange(false);
      onDeleted();
    },
    onError: () => setError('Failed to delete event. Please try again.'),
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
          role="alertdialog"
        >
          <Dialog.Title className="text-lg font-semibold text-gray-900">Delete Event</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-gray-600">
            This will permanently remove <strong>"{eventTitle}"</strong>. This cannot be undone.
          </Dialog.Description>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </Dialog.Close>
            <button
              disabled={isPending}
              onClick={() => mutate()}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? 'Deleting…' : 'Delete Event'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('startsAt');
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

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

  const events = data?.events ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <Link
          to="/events/new"
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Create Event
        </Link>
      </div>

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
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-36">
            <Select.Value placeholder="All Statuses" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg">
              <Select.Viewport className="p-1">
                {['ALL', 'DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED'].map(s => (
                  <Select.Item key={s} value={s} className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none">
                    <Select.ItemText>{s === 'ALL' ? 'All Statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root value={sort} onValueChange={setSort}>
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-40">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg">
              <Select.Viewport className="p-1">
                <Select.Item value="startsAt" className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none">
                  <Select.ItemText>Start Date</Select.ItemText>
                </Select.Item>
                <Select.Item value="createdAt" className="px-3 py-1.5 text-sm rounded cursor-pointer hover:bg-indigo-50 outline-none">
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
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className={`h-4 animate-pulse rounded bg-gray-200 ${j === 0 ? 'w-48' : 'w-24'}`} />
                    </td>
                  ))}
                </tr>
              ))
              : events.map(ev => {
                const tickets = sumTickets(ev.ticketTypes);
                const canDelete = ev.status === 'DRAFT' || ev.status === 'CANCELLED';
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
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="View"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => navigate(`/events/${ev.id}/edit`)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget({ id: ev.id, title: ev.title })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
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
                <td colSpan={6} className="px-4 py-16 text-center">
                  <CalendarOff size={32} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">No events found</p>
                  <Link to="/events/new" className="mt-2 inline-block text-indigo-600 text-sm hover:underline">
                    Create your first event
                  </Link>
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
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}

      {deleteTarget && (
        <DeleteDialog
          eventId={deleteTarget.id}
          eventTitle={deleteTarget.title}
          open={!!deleteTarget}
          onOpenChange={open => { if (!open) setDeleteTarget(null); }}
          onDeleted={() => showToast('Event deleted successfully')}
        />
      )}
    </div>
  );
}
