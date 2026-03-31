import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Calendar, MapPin, CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminEventListItem } from '@eventflow/types';
import { StatusBadge } from '@eventflow/ui';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiResp<T> = { success: boolean; data: T };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function priceRange(ticketTypes: AdminEventListItem['ticketTypes'] | undefined): string {
  if (!ticketTypes?.length) return 'No tickets';
  const total = ticketTypes.reduce((s, tt) => s + tt.quantityTotal, 0);
  const sold = ticketTypes.reduce((s, tt) => s + tt.quantitySold, 0);
  const remaining = total - sold;
  if (remaining === 0) return 'Sold out';
  return `${remaining} ticket${remaining !== 1 ? 's' : ''} left`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: AdminEventListItem }) {
  const availability = priceRange(event.ticketTypes);
  const isSoldOut = availability === 'Sold out';

  return (
    <Link
      to={`/events/${event.id}`}
      className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Banner */}
      <div className="relative h-40 bg-indigo-100 overflow-hidden">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Calendar size={32} className="text-indigo-200" />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <StatusBadge status={event.status} />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate">{event.title}</h3>

        <p className="mt-1 text-xs text-gray-500 line-clamp-2">
          {event.description}
        </p>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar size={12} className="shrink-0 text-gray-400" />
            {fmtDate(event.startsAt)}
          </div>
          {event.venue && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin size={12} className="shrink-0 text-gray-400" />
              {event.venue.name}, {event.venue.city}
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <span
            className={`text-xs font-medium ${
              isSoldOut ? 'text-red-500' : 'text-indigo-600'
            }`}
          >
            {availability}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('PUBLISHED');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const debouncedSearch = useDebounce(search, 400);
  const limit = 12;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: 'startsAt',
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status ? { status } : {}),
    });

    api
      .get<ApiResp<{ events: AdminEventListItem[]; total: number }>>(`/events?${params}`)
      .then((r) => {
        // API returns { events:[...], total, page, limit }; guard against bare-array shape
        const d = r.data.data as { events?: AdminEventListItem[]; total?: number } | AdminEventListItem[];
        setEvents(Array.isArray(d) ? d : (d.events ?? []));
        setTotal(Array.isArray(d) ? d.length : (d.total ?? 0));
      })
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch, status]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatus(e.target.value);
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upcoming Events</h1>
        <p className="text-sm text-gray-500 mt-1">Discover and book events near you</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={handleSearchChange}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={status}
          onChange={handleStatusChange}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="PUBLISHED">Upcoming</option>
          <option value="ONGOING">Ongoing</option>
          <option value="ENDED">Past</option>
        </select>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load events. Please refresh and try again.
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
              {/* Matches EventCard banner: h-40 */}
              <div className="h-40 bg-gray-200" />
              {/* Matches EventCard content: p-4 */}
              <div className="p-4">
                {/* Title */}
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                {/* Description (2 lines) */}
                <div className="mt-2 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-4/5" />
                </div>
                {/* Date + venue meta */}
                <div className="mt-3 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                {/* Availability badge */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <CalendarOff size={40} className="mb-4 text-gray-300" />
          <p className="font-medium text-gray-500">No events found</p>
          {(search || status) && (
            <button
              onClick={() => { setSearch(''); setStatus('PUBLISHED'); setPage(1); }}
              className="mt-3 text-sm text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

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
