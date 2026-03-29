import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  QrCode,
  Clock,
  History,
} from 'lucide-react';
import { EmptyState, formatNairaFromString } from '@eventflow/ui';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

interface MyTicket {
  id: string;
  status: TicketStatus;
  issuedAt: string;
  checkInAt?: string | null;
  qrToken: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    bannerUrl?: string | null;
    venue: { name: string; address: string };
  };
  ticketType: { name: string; price: string };
  seat?: { rowLabel: string; seatNumber: string; section?: string } | null;
}

type ApiResp<T> = { success: boolean; data: T; meta?: { page: number; total: number; limit: number } };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  USED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
  TRANSFERRED: 'bg-purple-100 text-purple-700',
};

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: MyTicket }) {
  const isPast = new Date(ticket.event.startsAt) < new Date();

  return (
    <Link
      to={`/my-tickets/${ticket.id}`}
      className="group flex gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
    >
      {/* Event thumbnail */}
      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-indigo-100 flex items-center justify-center">
        {ticket.event.bannerUrl ? (
          <img src={ticket.event.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Calendar size={20} className="text-indigo-300" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
            {ticket.event.title}
          </p>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[ticket.status]}`}>
            {ticket.status}
          </span>
        </div>

        <p className="text-xs text-gray-500 mt-0.5 truncate">{ticket.ticketType.name} · {formatNairaFromString(ticket.ticketType.price)}</p>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {fmtDate(ticket.event.startsAt)}
            {isPast && ' (Past)'}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {ticket.event.venue.name}
          </span>
          {ticket.seat && (
            <span className="flex items-center gap-1">
              <QrCode size={11} />
              Row {ticket.seat.rowLabel}, Seat {ticket.seat.seatNumber}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TicketSkeleton() {
  return (
    <div className="flex gap-4 bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
      <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  );
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TabId = 'upcoming' | 'past' | 'all';

const TABS: { id: TabId; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past',     label: 'Past' },
  { id: 'all',      label: 'All' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyTicketsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('upcoming');
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const limit = 10;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);

    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (activeTab === 'upcoming') params.set('status', 'ACTIVE');

    api
      .get<ApiResp<MyTicket[]>>(`/tickets?${params}`)
      .then((r) => {
        let data = r.data.data;
        // Filter past/upcoming client-side based on event.startsAt
        if (activeTab === 'upcoming') {
          data = data.filter((t) => new Date(t.event.startsAt) >= new Date());
        } else if (activeTab === 'past') {
          data = data.filter((t) => new Date(t.event.startsAt) < new Date());
        }
        setTickets(data);
        setTotal(r.data.meta?.total ?? data.length);
      })
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [activeTab, page]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    setPage(1);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tickets</h1>
        <p className="text-sm text-gray-500 mt-1">Your event tickets and booking history</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id: tabId, label }) => (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tabId
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          Failed to load tickets. Please refresh and try again.
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <TicketSkeleton key={i} />)
        ) : tickets.length > 0 ? (
          tickets.map((t) => <TicketCard key={t.id} ticket={t} />)
        ) : activeTab === 'upcoming' ? (
          <EmptyState
            icon={Clock}
            title="No upcoming tickets"
            description="You don't have any active tickets for future events."
            action={
              <Link to="/events" className="text-sm font-medium text-indigo-600 hover:underline">
                Browse upcoming events
              </Link>
            }
          />
        ) : activeTab === 'past' ? (
          <EmptyState
            icon={History}
            title="No past events attended"
            description="Events you've attended will appear here."
          />
        ) : (
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            description="Purchase tickets for events and they'll appear here."
            action={
              <Link to="/events" className="text-sm font-medium text-indigo-600 hover:underline">
                Browse events
              </Link>
            }
          />
        )}
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
