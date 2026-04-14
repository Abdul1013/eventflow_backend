-- Add production performance indexes.
-- All use IF NOT EXISTS — safe to re-run and does not conflict with
-- Prisma-generated indexes that already exist under different names.
-- NOTE: The only net-new index is idx_check_in_logs_ticket;
--       the remainder are explicitly named aliases for monitoring visibility.

-- Ticket lookup by QR token (hot path: every check-in scan)
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON "Ticket"("qrToken");

-- Tickets list filtered by user + event (attendee my-tickets page)
CREATE INDEX IF NOT EXISTS idx_tickets_user_event ON "Ticket"("userId", "eventId");

-- CheckInLog lookup by ticket (analytics + duplicate-scan detection)
CREATE INDEX IF NOT EXISTS idx_check_in_logs_ticket ON "CheckInLog"("ticketId");

-- Event list filtered by organizer
CREATE INDEX IF NOT EXISTS idx_events_organizer ON "Event"("organizerId");

-- Event list ordered / filtered by start time (upcoming events query)
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON "Event"("startsAt");

-- Seat lookup by venue (seat map rendering + allocation engine)
CREATE INDEX IF NOT EXISTS idx_seats_venue ON "Seat"("venueId");
