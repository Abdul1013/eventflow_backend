import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Calendar,
  MapPin,
  Users,
  BarChart3,
  LayoutGrid,
  Mail,
  Ticket,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { EventDetail } from '@eventflow/types';
import { StatusBadge, Badge } from '@eventflow/ui';
import { SeatMapPreview } from '@/components/SeatMapPreview';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiResp<T> = { success: boolean; data: T; meta?: { page: number; total: number; limit: number } };
type Tab = 'overview' | 'tickets' | 'attendees' | 'seatmap' | 'analytics';

interface LayoutSeat { number: string; x: number; y: number; accessible: boolean }
interface LayoutRow { label: string; seats: LayoutSeat[] }

interface AttendeeTicket {
  id: string;
  status: string;
  issuedAt: string;
  user: { id: string; name: string; email: string };
  ticketType: { name: string; price: string };
  seat?: { rowLabel: string; seatNumber: string; section?: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtDateShort(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

function fmtPrice(price: string) {
  const n = parseFloat(price);
  return n === 0 ? 'Free' : `₦${n.toLocaleString()}`;
}

function parseLayout(layoutJson: unknown): LayoutRow[] {
  if (layoutJson && typeof layoutJson === 'object' && 'rows' in layoutJson &&
    Array.isArray((layoutJson as { rows: unknown }).rows)) {
    return (layoutJson as { rows: LayoutRow[] }).rows;
  }
  return [];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  USED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
  TRANSFERRED: 'bg-purple-100 text-purple-700',
};

// ─── Status action config ─────────────────────────────────────────────────────

const STATUS_ACTIONS: Partial<Record<string, { label: string; nextStatus: string; danger?: boolean }>> = {
  DRAFT: { label: 'Publish Event', nextStatus: 'PUBLISHED' },
  PUBLISHED: { label: 'Cancel Event', nextStatus: 'CANCELLED', danger: true },
  ONGOING: { label: 'Cancel Event', nextStatus: 'CANCELLED', danger: true },
};

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',   label: 'Overview',   Icon: Calendar },
  { id: 'tickets',    label: 'Sales',      Icon: Ticket },
  { id: 'attendees',  label: 'Attendees',  Icon: Users },
  { id: 'seatmap',    label: 'Seat Map',   Icon: LayoutGrid },
  { id: 'analytics',  label: 'Analytics',  Icon: BarChart3 },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [attendeePage, setAttendeePage] = useState(1);

  const {
    data: event, isLoading, isError,
  } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api.get<ApiResp<EventDetail>>(`/events/${id!}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const {
    data: attendeeData,
    isLoading: isLoadingAttendees,
  } = useQuery({
    queryKey: ['admin-event-tickets', id, attendeePage],
    queryFn: () =>
      api
        .get<ApiResp<AttendeeTicket[]>>(`/admin/events/${id!}/tickets?page=${attendeePage}&limit=20`)
        .then((r) => ({ tickets: r.data.data, meta: r.data.meta })),
    enabled: !!id && activeTab === 'attendees',
  });

  const { mutate: changeStatus, isPending: isChangingStatus } = useMutation({
    mutationFn: (status: string) => api.patch(`/events/${id!}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-52 bg-gray-200 rounded-xl" />
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-4 w-96 bg-gray-100 rounded" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">Failed to load event.</p>
        <button onClick={() => navigate('/events')} className="mt-2 text-indigo-600 hover:underline text-sm">
          Back to Events
        </button>
      </div>
    );
  }

  const action = STATUS_ACTIONS[event.status];
  const layoutRows = parseLayout(event.venue.layoutJson);
  const totalSold = event.ticketTypes.reduce((s, tt) => s + tt.quantitySold, 0);
  const totalCapacity = event.ticketTypes.reduce((s, tt) => s + tt.quantityTotal, 0);
  const attendeeTotal = attendeeData?.meta?.total ?? 0;
  const attendeeTotalPages = Math.max(1, Math.ceil(attendeeTotal / 20));

  return (
    <div className="p-6 space-y-6">
      {/* ── Banner ── */}
      <div className="relative h-52 rounded-xl overflow-hidden bg-indigo-100">
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Calendar size={48} className="text-indigo-200" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight">{event.title}</h1>
            <p className="text-white/75 text-sm mt-1">{event.venue.name} — {event.venue.city}</p>
          </div>
          <StatusBadge status={event.status} className="shrink-0" />
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/events')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-center gap-3">
          {event.status === 'DRAFT' && (
            <Link
              to={`/events/${event.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <Pencil size={14} />
              Edit
            </Link>
          )}
          {action && (
            <button
              disabled={isChangingStatus}
              onClick={() => changeStatus(action.nextStatus)}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors ${
                action.danger
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isChangingStatus ? 'Updating…' : action.label}
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id: tabId, label, Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tabId
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{event.description}</p>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Ticket Types</h2>
              <div className="space-y-3">
                {event.ticketTypes.map((tt) => (
                  <div key={tt.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tt.name}</p>
                      {tt.description && <p className="text-xs text-gray-500 mt-0.5">{tt.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{fmtPrice(tt.price)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{tt.quantitySold} / {tt.quantityTotal} sold</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h2>
              <div className="flex items-start gap-2.5 text-sm text-gray-600">
                <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <p>{fmtDate(event.startsAt)}</p>
                  <p className="text-gray-400 text-xs my-0.5">to</p>
                  <p>{fmtDate(event.endsAt)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-600">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <p className="font-medium">{event.venue.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{event.venue.address}, {event.venue.city}</p>
                  <p className="text-xs text-gray-400">Capacity: {event.venue.totalCapacity.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <Users size={14} className="shrink-0 text-gray-400" />
                <p>{totalSold.toLocaleString()} / {totalCapacity.toLocaleString()} tickets sold</p>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Sales tab ── */}
      {activeTab === 'tickets' && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-5">Sales by Ticket Type</h2>
          <div className="space-y-5">
            {event.ticketTypes.map((tt) => {
              const pct = tt.quantityTotal > 0 ? Math.round((tt.quantitySold / tt.quantityTotal) * 100) : 0;
              return (
                <div key={tt.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-800">{tt.name}</span>
                    <span className="text-gray-500 text-xs">{tt.quantitySold} / {tt.quantityTotal} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmtPrice(tt.price)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Attendees tab ── */}
      {activeTab === 'attendees' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Ticket Holders {attendeeTotal > 0 && `(${attendeeTotal.toLocaleString()})`}
            </h2>
          </div>

          {isLoadingAttendees ? (
            <div className="p-5 space-y-3 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          ) : !attendeeData?.tickets.length ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              No tickets purchased yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket Type</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Issued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendeeData.tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{t.user.name}</td>
                        <td className="px-5 py-3 text-gray-500">
                          <a href={`mailto:${t.user.email}`} className="flex items-center gap-1 hover:text-indigo-600">
                            <Mail size={12} />
                            {t.user.email}
                          </a>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{t.ticketType.name}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{fmtDateShort(t.issuedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {attendeeTotalPages > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
                  <button
                    disabled={attendeePage === 1}
                    onClick={() => setAttendeePage((p) => p - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>
                  <span>Page {attendeePage} of {attendeeTotalPages}</span>
                  <button
                    disabled={attendeePage === attendeeTotalPages}
                    onClick={() => setAttendeePage((p) => p + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Seat map tab ── */}
      {activeTab === 'seatmap' && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Venue Layout — {event.venue.name}
          </h2>
          {layoutRows.length > 0 ? (
            <SeatMapPreview rows={layoutRows} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No seat map available for this venue.</p>
          )}
        </div>
      )}

      {/* ── Analytics tab ── */}
      {activeTab === 'analytics' && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-5">Ticket Sales</h2>
          {event.ticketTypes.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={event.ticketTypes.map((tt) => ({
                  name: tt.name,
                  Sold: tt.quantitySold,
                  Remaining: tt.quantityTotal - tt.quantitySold,
                }))}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="Sold" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Remaining" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No ticket data available.</p>
          )}
        </div>
      )}
    </div>
  );
}
