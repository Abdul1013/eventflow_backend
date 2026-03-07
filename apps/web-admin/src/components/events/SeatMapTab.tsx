import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, GitCompare, CheckCircle, XCircle, Clipboard, ChevronDown, ChevronUp } from 'lucide-react';
import { SeatMapPreview, type SeatStatus } from '@/components/SeatMapPreview';
import { api } from '@/lib/api';

// ─── Types
type ApiResp<T> = { success: boolean; data: T };

interface LayoutSeat { number: string; x: number; y: number; accessible: boolean }
interface LayoutRow  { label: string; seats: LayoutSeat[] }

interface SeatInfo {
  id: string;
  rowLabel: string;
  seatNumber: string;
  section: string | null;
  xCoord: number;
  yCoord: number;
  isAccessible: boolean;
  status: SeatStatus;
}

interface SeatsApiResponse {
  eventId: string;
  seats: SeatInfo[];
}

interface AllocationRecord {
  id: string;
  algorithmUsed: string;
  utilizationRate: number;
  runAt: string;
  seatsAssigned: number;
  seatMapJson: unknown;
}

interface ComparisonResult {
  eventId: string;
  eventTitle: string;
  saoUtilizationRate: number;
  baselineUtilizationRate: number;
  saoAdjacencyScore: number;
  baselineAdjacencyScore: number;
  improvementPercentage: number;
  hypothesisH1Passed: boolean;
}

interface AllocResult {
  algorithmUsed: string;
  utilizationRate: number;
}

// ─── Props 

interface SeatMapTabProps {
  eventId:     string;
  eventStatus: string;
  venueName:   string;
  layoutJson:  unknown;
}

// ─── Helpers 

function parseLayout(layoutJson: unknown): LayoutRow[] {
  if (
    layoutJson && typeof layoutJson === 'object' && 'rows' in layoutJson &&
    Array.isArray((layoutJson as { rows: unknown }).rows)
  ) {
    return (layoutJson as { rows: LayoutRow[] }).rows;
  }
  return [];
}

function fmtDateShort(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function fmtAlgorithm(alg: string) {
  return alg === 'kmeans_greedy' ? 'SAO (K-means + Greedy)' : alg === 'manual_baseline' ? 'Baseline (Manual)' : alg;
}

function buildTextReport(c: ComparisonResult): string {
  const pass = c.hypothesisH1Passed ? 'PASSED ✓' : 'FAILED ✗';
  return [
    `EventFlow H1 Validation Report — ${c.eventTitle}`,
    '─'.repeat(48),
    `SAO Utilization:      ${fmtPct(c.saoUtilizationRate)}`,
    `Baseline Utilization: ${fmtPct(c.baselineUtilizationRate)}`,
    `SAO Adjacency Score:  ${c.saoAdjacencyScore.toFixed(3)}`,
    `Baseline Adj. Score:  ${c.baselineAdjacencyScore.toFixed(3)}`,
    `Improvement:          ${c.improvementPercentage.toFixed(1)}%`,
    `H1 Hypothesis:        ${pass}`,
  ].join('\n');
}

// Sub-components 

function StatCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-indigo-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Main component 

export function SeatMapTab({ eventId, eventStatus, venueName, layoutJson }: SeatMapTabProps) {
  const queryClient = useQueryClient();

  const [showAllocConfirm,   setShowAllocConfirm]   = useState(false);
  const [showCompareConfirm, setShowCompareConfirm] = useState(false);
  const [allocMsg,           setAllocMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [compareResult,      setCompareResult]      = useState<ComparisonResult | null>(null);
  const [copiedTs,           setCopiedTs]           = useState<number | null>(null);
  const [expandedAllocId,    setExpandedAllocId]    = useState<string | null>(null);

  const canAllocate = eventStatus === 'PUBLISHED' || eventStatus === 'ONGOING';
  const layoutRows  = parseLayout(layoutJson);

  // ── Seats query ──
  const { data: seatsData, isLoading: isLoadingSeats } = useQuery({
    queryKey: ['event-seats', eventId],
    queryFn: () =>
      api.get<ApiResp<SeatsApiResponse>>(`/events/${eventId}/seats`).then((r) => r.data.data),
  });

  // ── Allocations history query 
  const { data: allocations = [], isLoading: isLoadingAllocs } = useQuery({
    queryKey: ['event-allocations', eventId],
    queryFn: () =>
      api.get<ApiResp<AllocationRecord[]>>(`/events/${eventId}/allocations`).then((r) => r.data.data),
  });

  // ── Run allocation mutation 
  const { mutate: runAllocation, isPending: isAllocating } = useMutation({
    mutationFn: () => api.post<ApiResp<AllocResult>>(`/events/${eventId}/allocate`),
    onSuccess: (res) => {
      setShowAllocConfirm(false);
      const rate = Math.round(res.data.data.utilizationRate * 100);
      setAllocMsg({
        type: 'success',
        text: `Allocation complete — ${rate}% utilization (${res.data.data.algorithmUsed})`,
      });
      void queryClient.invalidateQueries({ queryKey: ['event-seats', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['event-allocations', eventId] });
    },
    onError: () => {
      setShowAllocConfirm(false);
      setAllocMsg({ type: 'error', text: 'Allocation failed. Please try again.' });
    },
  });

  // ── Run comparison mutation 
  const { mutate: runComparison, isPending: isComparing } = useMutation({
    mutationFn: () =>
      api.post<ApiResp<ComparisonResult>>(`/events/${eventId}/allocate/compare`).then((r) => r.data.data),
    onSuccess: (result) => {
      setShowCompareConfirm(false);
      setCompareResult(result);
      void queryClient.invalidateQueries({ queryKey: ['event-allocations', eventId] });
    },
    onError: () => {
      setShowCompareConfirm(false);
      setAllocMsg({ type: 'error', text: 'Comparison failed. Please try again.' });
    },
  });

  const seatStatuses = useMemo<Record<string, SeatStatus>>(() => {
    if (!seatsData) return {};
    return Object.fromEntries(
      seatsData.seats.map((s) => [`${s.rowLabel}-${s.seatNumber}`, s.status]),
    );
  }, [seatsData]);

  const handleCopyReport = () => {
    if (!compareResult) return;
    void navigator.clipboard.writeText(buildTextReport(compareResult)).then(() => {
      setCopiedTs(Date.now());
      setTimeout(() => setCopiedTs(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Action bar: Run Allocation + Compare ── */}
      {canAllocate && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Seat Allocation</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Assign seats to ticket holders using the SAO algorithm, or compare it against the baseline.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setAllocMsg(null); setShowCompareConfirm(true); }}
              disabled={isAllocating || isComparing}
              className="flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 disabled:opacity-60 transition-colors"
            >
              <GitCompare size={14} />
              Compare Algorithms
            </button>
            <button
              onClick={() => { setAllocMsg(null); setShowAllocConfirm(true); }}
              disabled={isAllocating || isComparing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              <Zap size={14} />
              Run Allocation
            </button>
          </div>
        </div>
      )}

      {/* ── Result banner ── */}
      {allocMsg && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
          allocMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
        }`}>
          <span className="flex-1">{allocMsg.text}</span>
          <button
            onClick={() => setAllocMsg(null)}
            className="opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Seat map card ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Venue Layout — {venueName}
        </h2>
        {isLoadingSeats ? (
          <div className="h-72 bg-gray-100 animate-pulse rounded-lg" />
        ) : layoutRows.length > 0 ? (
          <SeatMapPreview
            rows={layoutRows}
            seatStatuses={seatsData ? seatStatuses : undefined}
          />
        ) : (
          <p className="text-sm text-gray-400 text-center py-12">
            No seat map available for this venue.
          </p>
        )}
      </div>

      {/* ── H1 Validation Panel ── */}
      {compareResult && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                H1 Validation — Algorithm Comparison
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                SAO (K-means + Greedy) vs Manual Baseline
              </p>
            </div>
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
            >
              <Clipboard size={12} />
              {copiedTs ? 'Copied!' : 'Copy Report'}
            </button>
          </div>

          {/* Verdict banner */}
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
            compareResult.hypothesisH1Passed
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {compareResult.hypothesisH1Passed
              ? <CheckCircle size={18} className="text-emerald-600 shrink-0" />
              : <XCircle    size={18} className="text-red-500    shrink-0" />
            }
            <div>
              <p className={`text-sm font-semibold ${compareResult.hypothesisH1Passed ? 'text-emerald-800' : 'text-red-700'}`}>
                {compareResult.hypothesisH1Passed
                  ? 'H1 Passed — SAO outperforms the baseline'
                  : 'H1 Not Passed — SAO did not outperform the baseline'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Improvement: {compareResult.improvementPercentage.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="SAO Utilization"
              value={fmtPct(compareResult.saoUtilizationRate)}
              highlight
            />
            <StatCard
              label="Baseline Utilization"
              value={fmtPct(compareResult.baselineUtilizationRate)}
            />
            <StatCard
              label="SAO Adjacency Score"
              value={compareResult.saoAdjacencyScore.toFixed(3)}
              sub="higher = better"
              highlight
            />
            <StatCard
              label="Baseline Adj. Score"
              value={compareResult.baselineAdjacencyScore.toFixed(3)}
              sub="higher = better"
            />
          </div>
        </div>
      )}

      {/* ── Allocation History ── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Allocation History
          </h2>
        </div>

        {isLoadingAllocs ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[1, 2].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : allocations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No allocations run yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {allocations.map((a) => (
              <div key={a.id}>
                <div className="px-5 py-3 flex items-center gap-4 text-sm">
                  <span className="font-medium text-gray-800 flex-1 min-w-0 truncate">
                    {fmtAlgorithm(a.algorithmUsed)}
                  </span>
                  <span className="text-gray-600 tabular-nums shrink-0">
                    {fmtPct(a.utilizationRate)} utilization
                  </span>
                  <span className="text-gray-400 tabular-nums shrink-0">
                    {a.seatsAssigned} seats
                  </span>
                  <span className="text-gray-400 text-xs shrink-0 hidden sm:block">
                    {fmtDateShort(a.runAt)}
                  </span>
                  {Array.isArray(a.seatMapJson) && (a.seatMapJson as unknown[]).length > 0 && (
                    <button
                      onClick={() => setExpandedAllocId(expandedAllocId === a.id ? null : a.id)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                    >
                      {expandedAllocId === a.id
                        ? <><ChevronUp size={12} /> Hide JSON</>
                        : <><ChevronDown size={12} /> View JSON</>
                      }
                    </button>
                  )}
                </div>

                {/* Expandable JSON viewer */}
                {expandedAllocId === a.id && (
                  <div className="px-5 pb-4">
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-64 text-gray-700">
                      {JSON.stringify(a.seatMapJson, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Run Allocation confirm dialog ── */}
      {showAllocConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Run Seat Allocation?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              This will overwrite any existing seat assignments for this event. The SAO algorithm
              will assign all active ticket holders to seats.
            </p>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setShowAllocConfirm(false)}
                disabled={isAllocating}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => runAllocation()}
                disabled={isAllocating}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {isAllocating ? 'Running…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compare Algorithms confirm dialog ── */}
      {showCompareConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Compare Allocation Algorithms?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Both the SAO (K-means + Greedy) and Baseline (Manual) algorithms will run in
              simulation mode. Results are recorded in the allocation history but seat
              assignments are <strong>not</strong> applied to tickets.
            </p>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setShowCompareConfirm(false)}
                disabled={isComparing}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => runComparison()}
                disabled={isComparing}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {isComparing ? 'Comparing…' : 'Run Comparison'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
