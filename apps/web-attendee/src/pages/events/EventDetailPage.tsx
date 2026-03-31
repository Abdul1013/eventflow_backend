import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, MapPin, ArrowLeft, Ticket, AlertCircle } from 'lucide-react';
import type { EventDetail } from '@eventflow/types';
import { StatusBadge, formatNairaFromString, formatEventDate } from '@eventflow/ui';
import { useAuthStore } from '@/lib/authStore';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiResp<T> = { success: boolean; data: T };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response: { data: { error?: { message: string } } } }).response;
    return resp?.data?.error?.message ?? 'An error occurred. Please try again.';
  }
  return 'An error occurred. Please try again.';
}

// ─── Purchase button ──────────────────────────────────────────────────────────

interface PurchaseButtonProps {
  eventId: string;
  ticketTypeId: string;
  isSoldOut: boolean;
  isEventActive: boolean;
  onPurchased: () => void;
}

function PurchaseButton({ eventId, ticketTypeId, isSoldOut, isEventActive, onPurchased }: PurchaseButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handlePurchase() {
    setError('');
    setIsPending(true);
    try {
      await api.post('/tickets', { eventId, ticketTypeId });
      onPurchased();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsPending(false);
    }
  }

  if (isSoldOut) {
    return (
      <span className="text-xs font-medium text-red-500 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50">
        Sold Out
      </span>
    );
  }

  if (!isEventActive) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={isPending}
        onClick={() => void handlePurchase()}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
      >
        <Ticket size={14} />
        {isPending ? 'Processing…' : 'Get Ticket'}
      </button>
      {error && <p className="text-xs text-red-500 max-w-xs text-right">{error}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setIsError(false);

    api
      .get<ApiResp<EventDetail>>(`/events/${id}`)
      .then((r) => setEvent(r.data.data))
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  function handlePurchased() {
    setSuccessMsg('Ticket purchased! Redirecting to your tickets…');
    setTimeout(() => navigate('/my-tickets'), 2000);
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse">
        <div className="h-56 bg-gray-200" />
        <div className="p-6 space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-100 rounded" />
          <div className="h-4 w-80 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          Failed to load event details. Please try again.
        </div>
        <Link
          to="/events"
          className="mt-4 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft size={14} />
          Back to Events
        </Link>
      </div>
    );
  }

  const isEventActive = event.status === 'PUBLISHED' || event.status === 'ONGOING';
  const cheapestTicket = [...event.ticketTypes].sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
  const allSoldOut = event.ticketTypes.every((tt) => tt.quantitySold >= tt.quantityTotal);

  return (
    // pb-24 on mobile reserves space for the fixed bottom CTA bar
    <div className="max-w-3xl mx-auto pb-24 md:pb-0">
      {/* ── Banner ── */}
      <div className="relative h-56 bg-indigo-100 overflow-hidden">
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Calendar size={56} className="text-indigo-200" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-6 right-6">
          <StatusBadge status={event.status} className="mb-2" />
          <h1 className="text-white text-2xl font-bold leading-tight">{event.title}</h1>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Back link */}
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          All Events
        </Link>

        {/* Success banner */}
        {successMsg && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
            <Ticket size={16} className="shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: description + ticket types */}
          <div className="md:col-span-2 space-y-6">
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                About This Event
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {event.description}
              </p>
            </section>

            {/* Ticket types (anchor target for mobile CTA) */}
            <section id="tickets-section">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Tickets
              </h2>
              <div className="space-y-3">
                {event.ticketTypes.map((tt) => {
                  const isSoldOut = tt.quantitySold >= tt.quantityTotal;
                  return (
                    <div
                      key={tt.id}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{tt.name}</p>
                        {tt.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{tt.description}</p>
                        )}
                        <p className="text-sm font-bold text-indigo-600 mt-1">
                          {formatNairaFromString(tt.price)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {tt.quantityTotal - tt.quantitySold} remaining
                        </p>
                      </div>

                      <div className="shrink-0 ml-4">
                        {!accessToken ? (
                          <Link to="/login" className="text-xs font-medium text-indigo-600 hover:underline">
                            Login to purchase
                          </Link>
                        ) : (
                          <PurchaseButton
                            eventId={event.id}
                            ticketTypeId={tt.id}
                            isSoldOut={isSoldOut}
                            isEventActive={isEventActive}
                            onPurchased={handlePurchased}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {!isEventActive && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    This event is no longer accepting ticket purchases.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Right: event details — sticky on desktop, hidden on mobile */}
          <div className="hidden md:block space-y-4">
            <div className="sticky top-4 space-y-4">
              <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Event Details
                </h2>

                <div className="flex items-start gap-2.5">
                  <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {formatEventDate(event.startsAt, event.endsAt)}
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <div className="text-sm text-gray-600">
                    <p className="font-medium">{event.venue.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {event.venue.address}, {event.venue.city}
                    </p>
                  </div>
                </div>
              </section>

              {accessToken && (
                <Link to="/my-tickets" className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <Ticket size={14} />
                  View My Tickets
                </Link>
              )}
            </div>
          </div>

          {/* Mobile: compact event meta — visible only below md */}
          <div className="md:hidden">
            <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <p className="text-xs text-gray-600 leading-relaxed">
                  {formatEventDate(event.startsAt, event.endsAt)}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">{event.venue.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{event.venue.address}, {event.venue.city}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom sticky CTA bar (hidden on md+) ── */}
      {isEventActive && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-5 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {cheapestTicket && (
              <>
                <p className="text-xs text-gray-400">From</p>
                <p className="text-base font-bold text-indigo-600">
                  {allSoldOut ? 'Sold Out' : formatNairaFromString(cheapestTicket.price)}
                </p>
              </>
            )}
          </div>

          {!accessToken ? (
            <Link
              to="/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
            >
              Sign in to buy
            </Link>
          ) : allSoldOut ? (
            <span className="px-5 py-2.5 bg-gray-100 text-gray-400 text-sm font-semibold rounded-lg shrink-0 cursor-not-allowed">
              Sold Out
            </span>
          ) : (
            <a
              href="#tickets-section"
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
            >
              <Ticket size={14} />
              Get Tickets
            </a>
          )}
        </div>
      )}
    </div>
  );
}
