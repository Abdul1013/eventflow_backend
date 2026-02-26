import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Ticket, ScanLine, Users } from 'lucide-react';
import type { AdminStats, EventRow } from '@eventflow/types';
import { api } from '@/lib/api';
import { StatCard } from '@/components/dashboard/StatCard';

// Local types 
interface PaginatedEvents {
  events: EventRow[];
  total: number;
  page: number;
  limit: number;
}

// API response envelope 

type ApiResp<T> = { success: boolean; data: T };

// Helpers 

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(iso));
}

const STATUS_BADGE: Record<EventRow['status'], string> = {
  DRAFT:     'bg-gray-100 text-gray-600',
  PUBLISHED: 'bg-indigo-100 text-indigo-600',
  ONGOING:   'bg-emerald-100 text-emerald-600',
  ENDED:     'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-100 text-red-600',
};

// Component 

export default function DashboardPage() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () =>
      api.get<ApiResp<AdminStats>>('/admin/stats').then((r) => r.data.data),
    staleTime: 30_000,
  });

  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['admin-upcoming-events'],
    queryFn: () =>
      api
        .get<ApiResp<PaginatedEvents>>('/events?status=PUBLISHED&limit=5&sort=startsAt')
        .then((r) => r.data.data.events),
    staleTime: 30_000,
  });

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stat cards */}
      {statsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between text-sm text-red-700">
          <span>Failed to load statistics.</span>
          <button
            onClick={() => void refetchStats()}
            className="font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Total Events"
          value={stats?.totalEvents}
          isLoading={statsLoading}
        />
        <StatCard
          icon={Ticket}
          label="Tickets Sold"
          value={stats?.ticketsSold}
          isLoading={statsLoading}
        />
        <StatCard
          icon={ScanLine}
          label="Today's Check-ins"
          value={stats?.todaysCheckIns}
          isLoading={statsLoading}
        />
        <StatCard
          icon={Users}
          label="Registered Users"
          value={stats?.totalUsers}
          isLoading={statsLoading}
        />
      </div>

      {/*  Upcoming events table */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Events</h2>

        {eventsError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between text-sm text-red-700 mb-4">
            <span>Failed to load events.</span>
            <button
              onClick={() => void refetchEvents()}
              className="font-medium underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Event Name', 'Date', 'Venue', 'Status', 'Tickets'].map((h) => (
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
              {eventsLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-200" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (events ?? []).map((ev: EventRow) => {
                    const badge = STATUS_BADGE[ev.status] ?? 'bg-gray-100 text-gray-600';
                    return (
                      <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to={`/events/${ev.id}`}
                            className="text-indigo-600 hover:text-indigo-700"
                          >
                            {ev.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(ev.startsAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {ev.venue?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                            {ev.status.charAt(0) + ev.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">—</td>
                      </tr>
                    );
                  })}

              {!eventsLoading && (events ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No upcoming events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
