import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Ticket, Users, LayoutGrid } from 'lucide-react';
import type { EventAnalytics, EventStatus } from '@eventflow/types';
import { StatCard } from '@/components/dashboard/StatCard';
import { api } from '@/lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

function fmtHour(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// ─── Section shell ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── Empty chart state ────────────────────────────────────────────────────────

function NoData({ message }: { message: string }) {
  return (
    <p className="text-sm text-gray-400 text-center py-12">{message}</p>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  eventId: string;
  eventStatus: EventStatus;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsTab({ eventId, eventStatus }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['event-analytics', eventId],
    queryFn: () =>
      api
        .get<{ success: boolean; data: EventAnalytics }>(`/admin/events/${eventId}/analytics`)
        .then((r) => r.data.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-lg" />
        <div className="h-64 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-red-500 text-center py-12">Failed to load analytics.</p>;
  }

  const { salesOverTime, checkInOverTime, ticketTypeBreakdown, revenueTotal, capacityStats, allocationHistory } = data;
  const showCheckinChart = ['ONGOING', 'ENDED'].includes(eventStatus) && checkInOverTime.length > 0;
  const allocationPct = capacityStats.totalSeats > 0
    ? Math.round((capacityStats.allocatedSeats / capacityStats.totalSeats) * 100)
    : 0;

  return (
    <div className="space-y-6">

      {/* ── Section 1: KPI stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Total Revenue"
          value={fmtRevenue(revenueTotal)}
        />
        <StatCard
          icon={Ticket}
          label="Tickets Sold"
          value={capacityStats.soldSeats.toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Checked In"
          value={capacityStats.checkedInSeats.toLocaleString()}
          trend={
            capacityStats.soldSeats > 0
              ? `${Math.round((capacityStats.checkedInSeats / capacityStats.soldSeats) * 100)}% attendance`
              : undefined
          }
        />
        <StatCard
          icon={LayoutGrid}
          label="Seat Utilisation"
          value={`${allocationPct}%`}
          trend={`${capacityStats.allocatedSeats} / ${capacityStats.totalSeats} seats`}
        />
      </div>

      {/* ── Section 2: Sales over time ── */}
      <Section title="Ticket Sales Over Time">
        {salesOverTime.length === 0 ? (
          <NoData message="No sales data yet." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={salesOverTime.map((d) => ({ ...d, date: fmtDate(d.date) }))}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                name="Tickets sold"
                stroke="#6366f1"
                fill="url(#salesGradient)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* ── Section 3: Ticket type breakdown ── */}
      <Section title="Ticket Type Breakdown">
        {ticketTypeBreakdown.length === 0 ? (
          <NoData message="No ticket types found." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Bar chart: sold vs remaining */}
            <div>
              <p className="text-xs text-gray-400 mb-3">Sold vs Remaining</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={ticketTypeBreakdown.map((tt) => ({
                    name: tt.name,
                    Sold: tt.sold,
                    Remaining: tt.total - tt.sold,
                  }))}
                  margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Sold" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Remaining" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart: revenue share */}
            <div>
              <p className="text-xs text-gray-400 mb-3">Revenue Share</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ticketTypeBreakdown}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {ticketTypeBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtRevenue(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 4: Check-in rate over time (ONGOING / ENDED only) ── */}
      {showCheckinChart && (
        <Section title="Check-In Rate Over Time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={checkInOverTime.map((d) => ({ ...d, hour: fmtHour(d.hour) }))}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                name="Check-ins"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* ── Section 5: Allocation utilization history ── */}
      {allocationHistory.length > 0 && (
        <Section title="Seat Allocation History">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={allocationHistory
                .slice()
                .reverse()
                .map((a, i) => ({
                  run: `Run ${i + 1}`,
                  algorithm: a.algorithmUsed,
                  utilisation: Math.round(a.utilizationRate * 100),
                }))}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="run" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="utilisation" name="Utilisation" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-1">
            {allocationHistory.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium text-gray-700">{a.algorithmUsed}</span>
                <span>{Math.round(a.utilizationRate * 100)}% utilisation</span>
                <span>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.runAt))}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
