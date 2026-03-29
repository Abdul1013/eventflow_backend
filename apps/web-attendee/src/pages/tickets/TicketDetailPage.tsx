import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatNairaFromString } from '@eventflow/ui';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Download,
  X,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

interface TicketDetail {
  id: string;
  status: TicketStatus;
  issuedAt: string;
  checkInAt?: string | null;
  qrToken: string;
  qrDataUrl: string;
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

type ApiResp<T> = { success: boolean; data: T };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

const STATUS_STYLES: Record<TicketStatus, { badge: string; label: string }> = {
  ACTIVE: { badge: 'bg-emerald-100 text-emerald-700', label: 'Valid' },
  USED: { badge: 'bg-blue-100 text-blue-700', label: 'Used' },
  CANCELLED: { badge: 'bg-red-100 text-red-700', label: 'Cancelled' },
  TRANSFERRED: { badge: 'bg-purple-100 text-purple-700', label: 'Transferred' },
};

// ─── Cancel modal ─────────────────────────────────────────────────────────────

interface CancelModalProps {
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}

function CancelModal({ onConfirm, onClose, isPending }: CancelModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <X size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Cancel Ticket?</h3>
            <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to cancel this ticket? You will lose access to this event.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Ticket
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
          >
            {isPending ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer modal ───────────────────────────────────────────────────────────

interface TransferModalProps {
  onConfirm: (email: string) => void;
  onClose: () => void;
  isPending: boolean;
  error: string;
}

function TransferModal({ onConfirm, onClose, isPending, error }: TransferModalProps) {
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');

  function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setLocalError('');
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <Send size={18} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Transfer Ticket</h3>
            <p className="text-xs text-gray-500 mt-0.5">Enter the recipient's email address.</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          The ticket will be permanently transferred. The recipient must have an EventFlow account.
        </p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="recipient@example.com"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 mb-1"
        />

        {(localError || error) && (
          <p className="text-xs text-red-600 mb-3">{localError || error}</p>
        )}

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            {isPending ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket card (for display + download ref) ─────────────────────────────────

interface TicketCardProps {
  ticket: TicketDetail;
  cardRef: React.RefObject<HTMLDivElement>;
}

function TicketCard({ ticket, cardRef }: TicketCardProps) {
  const statusStyle = STATUS_STYLES[ticket.status];

  return (
    <div
      ref={cardRef}
      className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-sm mx-auto"
    >
      {/* Banner — overflow-hidden scoped here to preserve rounded top corners */}
      <div className="relative h-32 bg-indigo-600 overflow-hidden rounded-t-2xl">
        {ticket.event.bannerUrl ? (
          <img src={ticket.event.bannerUrl} alt="" className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Ticket size={40} className="text-indigo-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/70 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-white font-bold text-lg leading-tight">{ticket.event.title}</p>
        </div>
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusStyle.badge}`}>
            {statusStyle.label}
          </span>
        </div>
      </div>

      {/* Dashed ticket-stub divider with semicircle notch cutouts.
          The card has no overflow-hidden so circles extend outside the border,
          creating genuine half-moon notches. bg-gray-50 matches the page background. */}
      <div className="relative flex items-center py-1 my-1">
        <div className="absolute -left-[9px] w-[18px] h-[18px] rounded-full bg-gray-50 border border-gray-100 z-10" />
        <div className="flex-1 mx-4 border-t-2 border-dashed border-gray-200" />
        <div className="absolute -right-[9px] w-[18px] h-[18px] rounded-full bg-gray-50 border border-gray-100 z-10" />
      </div>

      {/* Details */}
      <div className="px-5 pt-3 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Ticket Type</p>
            <p className="text-gray-800 font-semibold mt-0.5">{ticket.ticketType.name}</p>
            <p className="text-indigo-600 text-xs font-medium">{formatNairaFromString(ticket.ticketType.price)}</p>
          </div>
          {ticket.seat ? (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Seat</p>
              <p className="text-gray-800 font-semibold mt-0.5">
                Row {ticket.seat.rowLabel}, #{ticket.seat.seatNumber}
              </p>
              {ticket.seat.section && (
                <p className="text-xs text-gray-400">{ticket.seat.section}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Access</p>
              <p className="text-gray-800 font-semibold mt-0.5">General</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-gray-400 shrink-0" />
            {fmtDate(ticket.event.startsAt)}
          </div>
          {ticket.event.venue && (
            <div className="flex items-center gap-1.5">
              <MapPin size={12} className="text-gray-400 shrink-0" />
              {ticket.event.venue.name} · {ticket.event.venue.address}
            </div>
          )}
        </div>

        {/* QR Code */}
        {ticket.status === 'ACTIVE' && (
          <div className="pt-2 flex flex-col items-center gap-1">
            <img
              src={ticket.qrDataUrl}
              alt="Ticket QR code"
              className="w-40 h-40"
            />
            <p className="text-xs text-gray-400">Scan at the venue entrance</p>
          </div>
        )}

        {ticket.status === 'USED' && ticket.checkInAt && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <CheckCircle2 size={14} className="shrink-0" />
            Checked in on {fmtDate(ticket.checkInAt)}
          </div>
        )}

        {/* Ticket ID footer */}
        <p className="text-center text-xs text-gray-300 pt-1 font-mono">{ticket.id.slice(0, 8).toUpperCase()}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cardRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setIsError(false);

    api
      .get<ApiResp<TicketDetail>>(`/tickets/${id}`)
      .then((r) => setTicket(r.data.data))
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  async function handleCancel() {
    if (!ticket) return;
    setCancelError('');
    setIsCancelling(true);
    try {
      await api.post(`/tickets/${ticket.id}/cancel`);
      setTicket((prev) => prev ? { ...prev, status: 'CANCELLED' } : prev);
      setShowCancelModal(false);
    } catch {
      setCancelError('Failed to cancel ticket. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleTransfer(toEmail: string) {
    if (!ticket) return;
    setTransferError('');
    setIsTransferring(true);
    try {
      await api.post(`/tickets/${ticket.id}/transfer`, { toEmail });
      setShowTransferModal(false);
      setTransferSuccess(`Ticket successfully transferred to ${toEmail}.`);
      setTicket((prev) => prev ? { ...prev, status: 'TRANSFERRED' } : prev);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Transfer failed. Please try again.';
      setTransferError(msg);
    } finally {
      setIsTransferring(false);
    }
  }

  function handleDownloadQr() {
    if (!ticket?.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = ticket.qrDataUrl;
    a.download = `ticket-${ticket.id.slice(0, 8)}-qr.png`;
    a.click();
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-sm mx-auto animate-pulse">
        <div className="h-32 bg-gray-200 rounded-2xl mb-4" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="p-6 max-w-sm mx-auto">
        <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={16} className="shrink-0" />
          Failed to load ticket. Please try again.
        </div>
        <Link to="/my-tickets" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline">
          <ArrowLeft size={14} />
          Back to My Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-sm mx-auto space-y-6">
      {/* Back */}
      <Link
        to="/my-tickets"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={14} />
        My Tickets
      </Link>

      {/* Ticket card */}
      <TicketCard ticket={ticket} cardRef={cardRef} />

      {/* Error from cancel */}
      {cancelError && (
        <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {cancelError}
        </div>
      )}

      {/* Transfer success banner */}
      {transferSuccess && (
        <div className="flex items-center gap-3 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <CheckCircle2 size={16} className="shrink-0" />
          {transferSuccess}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {ticket.status === 'ACTIVE' && (
          <button
            onClick={handleDownloadQr}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            Download QR Code
          </button>
        )}

        {ticket.status === 'ACTIVE' && (
          <button
            onClick={() => { setTransferError(''); setShowTransferModal(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-indigo-200 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Send size={16} />
            Transfer Ticket
          </button>
        )}

        {ticket.status === 'ACTIVE' && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <X size={16} />
            Cancel Ticket
          </button>
        )}

        <Link
          to={`/events/${ticket.event.id}`}
          className="block text-center text-sm text-indigo-600 hover:underline py-1"
        >
          View Event Details
        </Link>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <CancelModal
          onConfirm={() => void handleCancel()}
          onClose={() => setShowCancelModal(false)}
          isPending={isCancelling}
        />
      )}

      {/* Transfer modal */}
      {showTransferModal && (
        <TransferModal
          onConfirm={(email) => void handleTransfer(email)}
          onClose={() => setShowTransferModal(false)}
          isPending={isTransferring}
          error={transferError}
        />
      )}
    </div>
  );
}
