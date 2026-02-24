// ─── Shared API types (used by web apps and mobile to type API responses) ─────

export type Role = 'ADMIN' | 'STAFF' | 'ATTENDEE';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'ENDED' | 'CANCELLED';
export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { page: number; total: number; limit: number };
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  createdAt: string;
}

export interface EventDto {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  bannerUrl?: string;
  venue: { id: string; name: string; city: string };
}

export interface TicketTypeDto {
  id: string;
  name: string;
  price: string;
  quantityTotal: number;
  quantitySold: number;
  description?: string;
}

export interface TicketDto {
  id: string;
  qrToken: string;
  status: TicketStatus;
  issuedAt: string;
  event: Pick<EventDto, 'id' | 'title' | 'startsAt' | 'venue'>;
  ticketType: Pick<TicketTypeDto, 'name' | 'price'>;
  seat?: { rowLabel: string; seatNumber: string; section?: string };
}

export interface CheckinResult {
  result: 'VALID' | 'ALREADY_USED' | 'INVALID_TOKEN' | 'EVENT_NOT_ACTIVE' | 'TICKET_CANCELLED';
  ticketId?: string;
}

export interface CheckinStats {
  total: number;
  checked: number;
  remaining: number;
}

// ─── Auth types ───────────────────────────────────────────────────────────────
export type { AuthTokens, JwtPayload, AuthUser, LoginResponseData } from './auth.types.js';
