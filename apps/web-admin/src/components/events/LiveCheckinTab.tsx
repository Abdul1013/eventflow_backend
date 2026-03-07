import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Users, Activity } from 'lucide-react';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useAuthStore } from '@/lib/authStore';
import { api } from '@/lib/api';

// ─── Types 

type ApiResp<T> = { success: boolean; data: T };

interface RecentScan {
  id:           string;
  scannedAt:    string;
  result:       string;
  attendeeName: string;
}

interface CheckInStats {
  totalTickets: number;
  checkedIn:    number;
  remaining:    number;
  checkInRate:  number;
  errorCount:   number;
  recentScans:  RecentScan[];
  cacheHit:     boolean;
}

interface ManualCheckinResponse {
  result:       string;
  message:      string;
  attendeeName?: string;
  seatInfo?:    string;
  ticketType?:  string;
}

// ─── Helpers 

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

function fmtSecondsAgo(s: number): string {
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

const RESULT_STYLES: Record<string, string> = {
  VALID:            'bg-emerald-100 text-emerald-700',
  ALREADY_USED:     'bg-blue-100   text-blue-700',
  INVALID_TOKEN:    'bg-red-100    text-red-700',
  TICKET_CANCELLED: 'bg-amber-100  text-amber-700',
  EVENT_NOT_ACTIVE: 'bg-gray-100   text-gray-600',
};

// ─── Sub-components 

function StatCard({
  label, value, sub, colorClass, icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  colorClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
      <div className={`mt-0.5 shrink-0 ${colorClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main component 

interface LiveCheckinTabProps {
  eventId: string;
}

export function LiveCheckinTab({ eventId }: LiveCheckinTabProps) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  // ── Stats auto-refresh every 30 s 
  const { data: stats, dataUpdatedAt, isLoading } = useQuery({
    queryKey: ['checkin-stats', eventId],
    queryFn: () =>
      api
        .get<ApiResp<CheckInStats>>(`/checkin/stats/${eventId}`)
        .then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  // ── "Last updated X seconds ago" ticker 
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Reset counter whenever fresh data arrives
  useEffect(() => {
    setSecondsAgo(0);
  }, [dataUpdatedAt]);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setSecondsAgo((s) => s + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Manual check-in state 
  const [ticketInput, setTicketInput] = useState('');
  const [manualMsg,   setManualMsg]   = useState<{
    type: 'success' | 'error';
    text: string;
    detail?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate: doManualCheckin, isPending: isCheckingIn } = useMutation({
    mutationFn: (ticketId: string) =>
      api
        .post<ApiResp<ManualCheckinResponse>>('/checkin/manual', { ticketId })
        .then((r) => r.data.data),
    onSuccess: (data) => {
      setManualMsg({
        type:   'success',
        text:   `Checked in: ${data.attendeeName ?? 'Attendee'}`,
        detail: [data.ticketType, data.seatInfo].filter(Boolean).join(' · '),
      });
      setTicketInput('');
      inputRef.current?.focus();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Check-in failed. Verify the ticket ID.';
      setManualMsg({ type: 'error', text: msg });
    },
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = ticketInput.trim();
    if (!UUID_RE.test(id)) {
      setManualMsg({ type: 'error', text: 'Please enter a valid ticket UUID.' });
      return;
    }
    setManualMsg(null);
    doManualCheckin(id);
  };

  // ── Render

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="h-72 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  const s = stats;

  return (
    <div className="space-y-5">
      {/* ── Header: last-updated ticker ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Live Check-In
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock size={11} />
          Updated {fmtSecondsAgo(secondsAgo)} · auto-refreshes every 30 s
          {s && (
            <span
              className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                s.cacheHit
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {s.cacheHit ? 'cached' : 'live'}
            </span>
          )}
        </span>
      </div>

      {/* ── Top stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Checked In"
          value={s?.checkedIn ?? 0}
          sub={`of ${s?.totalTickets ?? 0} total`}
          colorClass="text-emerald-600"
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="Remaining"
          value={s?.remaining ?? 0}
          sub="still to arrive"
          colorClass="text-indigo-600"
          icon={<Users size={18} />}
        />
        <div className="bg-white border border-gray-200 rounded-lg p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-2">Check-In Rate</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold tabular-nums text-indigo-600">
              {(s?.checkInRate ?? 0).toFixed(1)}%
            </p>
            <Activity size={16} className="text-indigo-400 shrink-0" />
          </div>
          {/* Progress bar */}
          <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, s?.checkInRate ?? 0)}%` }}
            />
          </div>
        </div>
        <StatCard
          label="Errors"
          value={s?.errorCount ?? 0}
          sub="invalid / cancelled"
          colorClass={(s?.errorCount ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}
          icon={<AlertTriangle size={18} />}
        />
      </div>

      {/* ── Central circular progress + recent scans feed ── */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5">
        {/* Circular progress */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center gap-2 min-w-[200px]">
          <CircularProgress
            percentage={s?.checkInRate ?? 0}
            size={200}
            strokeWidth={16}
            color="#6366f1"
          />
          <p className="text-xs text-gray-400 text-center">
            {s?.checkedIn ?? 0} / {s?.totalTickets ?? 0} attendees
          </p>
        </div>

        {/* Recent scans feed */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Recent Scans
            </p>
          </div>

          {!s?.recentScans.length ? (
            <div className="flex-1 flex items-center justify-center py-10 text-sm text-gray-400">
              No scans yet — waiting for check-ins…
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 overflow-y-auto flex-1">
              {s.recentScans.map((scan) => (
                <li
                  key={`${scan.id}-${scan.scannedAt}`}
                  className="px-4 py-3 flex items-center gap-3 animate-fadeIn"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {scan.attendeeName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {timeAgo(scan.scannedAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      RESULT_STYLES[scan.result] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {scan.result.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Manual check-in panel (admin only) ── */}
      {isAdmin && (
        <div className="bg-white border border-amber-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={16}
              className="text-amber-500 mt-0.5 shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Manual Check-In Override
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Use only when QR scanning is not possible (e.g. damaged print,
                no mobile data).
              </p>
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={ticketInput}
              onChange={(e) => {
                setTicketInput(e.target.value);
                if (manualMsg) setManualMsg(null);
              }}
              placeholder="Ticket UUID (e.g. 3fa85f64-…)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:font-sans"
              disabled={isCheckingIn}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={isCheckingIn || !ticketInput.trim()}
              className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors shrink-0"
            >
              {isCheckingIn ? 'Checking in…' : 'Check In'}
            </button>
          </form>

          {/* Inline result message */}
          {manualMsg && (
            <div
              className={`flex flex-col gap-0.5 rounded-lg px-4 py-3 text-sm ${
                manualMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              <span className="font-medium">{manualMsg.text}</span>
              {manualMsg.detail && (
                <span className="text-xs opacity-80">{manualMsg.detail}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
