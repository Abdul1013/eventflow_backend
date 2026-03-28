import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

// process.cwd() resolves to apps/api/ when started via `pnpm dev`
const srcDir = path.join(process.cwd(), 'src');

const definition: swaggerJsdoc.OAS3Definition = {
  openapi: '3.0.0',
  info: {
    title: 'EventFlow API',
    version: '1.0.0',
    description:
      'REST API for the EventFlow event-management system.\n\n' +
      'Lead City University — Computer Science Final Year Project.\n\n' +
      '**Authentication**: Most endpoints require a `Bearer` JWT access token ' +
      'obtained from `POST /auth/login`. Pass it in the `Authorization` header.',
    contact: { name: 'Ogundipe Mubin Prince', email: 'mubin@eventflow.test' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3001/api/v1', description: 'Local development' },
    { url: 'https://eventflow-api.railway.app/api/v1', description: 'Production (Railway)' },
  ],
  tags: [
    { name: 'Auth',     description: 'Registration, login, token refresh and password management' },
    { name: 'Events',   description: 'Event listing, creation, and lifecycle management' },
    { name: 'Tickets',  description: 'Ticket purchase, viewing, cancellation and transfer' },
    { name: 'Check-in', description: 'QR-code scan and manual check-in operations (STAFF / ADMIN)' },
    { name: 'Admin',    description: 'Platform administration — dashboard, user management, analytics (ADMIN only)' },
    { name: 'Venues',   description: 'Venue and seating management (ADMIN only)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {

      // ── Common ────────────────────────────────────────────────────────────────

      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code:    { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid input data' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },

      PaginationMeta: {
        type: 'object',
        properties: {
          page:  { type: 'integer', example: 1 },
          total: { type: 'integer', example: 42 },
          limit: { type: 'integer', example: 20 },
        },
      },

      // ── Auth ──────────────────────────────────────────────────────────────────

      RegisterBody: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name:     { type: 'string', minLength: 2, maxLength: 100, example: 'Amaka Johnson' },
          email:    { type: 'string', format: 'email', example: 'amaka@example.com' },
          password: { type: 'string', minLength: 8, example: 'SecurePass1', description: 'Min 8 chars, 1 uppercase, 1 digit' },
          phone:    { type: 'string', example: '+2348012345678' },
        },
      },

      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'amaka@example.com' },
          password: { type: 'string', example: 'SecurePass1' },
        },
      },

      ForgotPasswordBody: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'amaka@example.com' },
        },
      },

      ResetPasswordBody: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token:       { type: 'string', example: 'abc123tokenFromEmail' },
          newPassword: { type: 'string', minLength: 8, example: 'NewSecure2' },
        },
      },

      AuthUser: {
        type: 'object',
        properties: {
          id:            { type: 'string', format: 'uuid' },
          name:          { type: 'string', example: 'Amaka Johnson' },
          email:         { type: 'string', format: 'email' },
          role:          { type: 'string', enum: ['ADMIN', 'STAFF', 'ATTENDEE'] },
          emailVerified: { type: 'boolean' },
          createdAt:     { type: 'string', format: 'date-time' },
        },
      },

      AuthTokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', description: 'Short-lived JWT — include in Authorization: Bearer header' },
        },
      },

      // ── Venues ────────────────────────────────────────────────────────────────

      VenueSummary: {
        type: 'object',
        properties: {
          id:       { type: 'string', format: 'uuid' },
          name:     { type: 'string', example: 'Lead City University Auditorium' },
          address:  { type: 'string', example: '12 Toll Gate Roundabout' },
          city:     { type: 'string', example: 'Ibadan' },
          capacity: { type: 'integer', example: 500 },
        },
      },

      SectionInput: {
        type: 'object',
        required: ['name', 'rowStart', 'rowEnd', 'seatsPerRow'],
        properties: {
          name:        { type: 'string', example: 'VIP' },
          rowStart:    { type: 'string', example: 'A' },
          rowEnd:      { type: 'string', example: 'D' },
          seatsPerRow: { type: 'integer', example: 20 },
        },
      },

      CreateVenueBody: {
        type: 'object',
        required: ['name', 'address', 'city', 'capacity'],
        properties: {
          name:     { type: 'string', example: 'Lead City University Auditorium' },
          address:  { type: 'string', example: '12 Toll Gate Roundabout' },
          city:     { type: 'string', example: 'Ibadan' },
          capacity: { type: 'integer', minimum: 1, example: 500 },
          sections: { type: 'array', items: { '$ref': '#/components/schemas/SectionInput' } },
        },
      },

      VenueDetail: {
        allOf: [
          { '$ref': '#/components/schemas/VenueSummary' },
          {
            type: 'object',
            properties: {
              seatCount: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },

      // ── Events ────────────────────────────────────────────────────────────────

      TicketTypeInput: {
        type: 'object',
        required: ['name', 'price', 'quantityTotal'],
        properties: {
          name:          { type: 'string', example: 'General Admission' },
          price:         { type: 'number', minimum: 0, example: 5000 },
          quantityTotal: { type: 'integer', minimum: 1, example: 200 },
          description:   { type: 'string', example: 'Standard standing ticket' },
        },
      },

      TicketTypeSummary: {
        type: 'object',
        properties: {
          id:            { type: 'string', format: 'uuid' },
          name:          { type: 'string' },
          price:         { type: 'string', example: '5000.00' },
          quantityTotal: { type: 'integer' },
          quantitySold:  { type: 'integer' },
          description:   { type: 'string' },
        },
      },

      CreateEventBody: {
        type: 'object',
        required: ['title', 'description', 'venueId', 'startsAt', 'endsAt', 'ticketTypes'],
        properties: {
          title:       { type: 'string', minLength: 3, maxLength: 200, example: 'LCU Tech Summit 2026' },
          description: { type: 'string', minLength: 10, example: 'Annual technology summit at Lead City University.' },
          venueId:     { type: 'string', format: 'uuid' },
          startsAt:    { type: 'string', format: 'date-time', example: '2026-06-15T10:00:00Z' },
          endsAt:      { type: 'string', format: 'date-time', example: '2026-06-15T18:00:00Z' },
          bannerUrl:   { type: 'string', format: 'uri' },
          ticketTypes: {
            type: 'array',
            minItems: 1,
            items: { '$ref': '#/components/schemas/TicketTypeInput' },
          },
        },
      },

      UpdateEventBody: {
        type: 'object',
        description: 'All fields are optional — send only the fields to update.',
        properties: {
          title:       { type: 'string' },
          description: { type: 'string' },
          venueId:     { type: 'string', format: 'uuid' },
          startsAt:    { type: 'string', format: 'date-time' },
          endsAt:      { type: 'string', format: 'date-time' },
          bannerUrl:   { type: 'string', format: 'uri' },
        },
      },

      EventStatusBody: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED'] },
        },
      },

      EventSummary: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          title:       { type: 'string' },
          description: { type: 'string' },
          status:      { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED'] },
          startsAt:    { type: 'string', format: 'date-time' },
          endsAt:      { type: 'string', format: 'date-time' },
          bannerUrl:   { type: 'string', nullable: true },
          venue:       { '$ref': '#/components/schemas/VenueSummary' },
          ticketTypes: { type: 'array', items: { '$ref': '#/components/schemas/TicketTypeSummary' } },
        },
      },

      Seat: {
        type: 'object',
        properties: {
          id:           { type: 'string', format: 'uuid' },
          rowLabel:     { type: 'string', example: 'A' },
          seatNumber:   { type: 'string', example: '12' },
          section:      { type: 'string', example: 'VIP', nullable: true },
          isAccessible: { type: 'boolean' },
          isAllocated:  { type: 'boolean' },
        },
      },

      AllocationRun: {
        type: 'object',
        properties: {
          id:            { type: 'string', format: 'uuid' },
          runAt:         { type: 'string', format: 'date-time' },
          algorithm:     { type: 'string', example: 'greedy' },
          assignedCount: { type: 'integer' },
          score:         { type: 'number' },
        },
      },

      // ── Tickets ───────────────────────────────────────────────────────────────

      PurchaseTicketBody: {
        type: 'object',
        required: ['eventId', 'ticketTypeId'],
        properties: {
          eventId:      { type: 'string', format: 'uuid' },
          ticketTypeId: { type: 'string', format: 'uuid' },
          preferences: {
            type: 'object',
            properties: {
              groupSize:       { type: 'integer', minimum: 1, maximum: 20 },
              needsAccessible: { type: 'boolean' },
            },
          },
        },
      },

      CancelTicketBody: {
        type: 'object',
        properties: {
          reason: { type: 'string', maxLength: 200, example: 'Change of plans' },
        },
      },

      TransferTicketBody: {
        type: 'object',
        required: ['toEmail'],
        properties: {
          toEmail: { type: 'string', format: 'email', example: 'friend@example.com' },
        },
      },

      TicketSummary: {
        type: 'object',
        properties: {
          id:         { type: 'string', format: 'uuid' },
          status:     { type: 'string', enum: ['ACTIVE', 'USED', 'CANCELLED', 'TRANSFERRED'] },
          issuedAt:   { type: 'string', format: 'date-time' },
          checkInAt:  { type: 'string', format: 'date-time', nullable: true },
          event: {
            type: 'object',
            properties: {
              id:       { type: 'string', format: 'uuid' },
              title:    { type: 'string' },
              startsAt: { type: 'string', format: 'date-time' },
              bannerUrl:{ type: 'string', nullable: true },
              venue:    { '$ref': '#/components/schemas/VenueSummary' },
            },
          },
          ticketType: {
            type: 'object',
            properties: {
              name:  { type: 'string' },
              price: { type: 'string' },
            },
          },
          seat: { '$ref': '#/components/schemas/Seat', nullable: true },
        },
      },

      TicketDetail: {
        allOf: [
          { '$ref': '#/components/schemas/TicketSummary' },
          {
            type: 'object',
            properties: {
              qrToken: { type: 'string', description: 'Base64-encoded QR code data URI' },
            },
          },
        ],
      },

      // ── Check-in ──────────────────────────────────────────────────────────────

      ScanBody: {
        type: 'object',
        required: ['token'],
        properties: {
          token:      { type: 'string', description: 'QR code token from the ticket' },
          deviceInfo: { type: 'string', example: 'EventFlow Staff App' },
        },
      },

      ManualCheckinBody: {
        type: 'object',
        required: ['ticketId'],
        properties: {
          ticketId: { type: 'string', format: 'uuid' },
        },
      },

      ScanResult: {
        type: 'object',
        properties: {
          result: {
            type: 'string',
            enum: ['VALID', 'ALREADY_USED', 'INVALID_TOKEN', 'EVENT_NOT_ACTIVE', 'TICKET_CANCELLED'],
          },
          attendeeName: { type: 'string', nullable: true },
          ticketType:   { type: 'string', nullable: true },
          seat:         { type: 'string', nullable: true },
          message:      { type: 'string', nullable: true },
        },
      },

      RecentScan: {
        type: 'object',
        properties: {
          id:           { type: 'string', format: 'uuid' },
          attendeeName: { type: 'string' },
          result:       { type: 'string' },
          scannedAt:    { type: 'string', format: 'date-time' },
        },
      },

      CheckInStats: {
        type: 'object',
        properties: {
          totalTickets: { type: 'integer' },
          checkedIn:    { type: 'integer' },
          remaining:    { type: 'integer' },
          checkInRate:  { type: 'number', format: 'float', example: 72.5 },
          errorCount:   { type: 'integer' },
          recentScans:  { type: 'array', items: { '$ref': '#/components/schemas/RecentScan' } },
        },
      },

      // ── Admin ─────────────────────────────────────────────────────────────────

      UpdateRoleBody: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'STAFF', 'ATTENDEE'] },
        },
      },

      UserSummary: {
        type: 'object',
        properties: {
          id:            { type: 'string', format: 'uuid' },
          name:          { type: 'string' },
          email:         { type: 'string', format: 'email' },
          role:          { type: 'string', enum: ['ADMIN', 'STAFF', 'ATTENDEE'] },
          emailVerified: { type: 'boolean' },
          createdAt:     { type: 'string', format: 'date-time' },
        },
      },

      DashboardStats: {
        type: 'object',
        properties: {
          totalEvents:   { type: 'integer' },
          totalTickets:  { type: 'integer' },
          totalUsers:    { type: 'integer' },
          totalRevenue:  { type: 'number' },
          recentEvents:  { type: 'array', items: { '$ref': '#/components/schemas/EventSummary' } },
        },
      },

      SalesDataPoint: {
        type: 'object',
        properties: {
          date:  { type: 'string', format: 'date', example: '2026-06-10' },
          count: { type: 'integer' },
        },
      },

      CheckInDataPoint: {
        type: 'object',
        properties: {
          hour:  { type: 'string', format: 'date-time' },
          count: { type: 'integer' },
        },
      },

      CapacityStats: {
        type: 'object',
        properties: {
          totalSeats:     { type: 'integer' },
          allocatedSeats: { type: 'integer' },
          soldSeats:      { type: 'integer' },
          checkedInSeats: { type: 'integer' },
          occupancyRate:  { type: 'number' },
        },
      },

      AllocationHistoryEntry: {
        type: 'object',
        properties: {
          id:            { type: 'string', format: 'uuid' },
          runAt:         { type: 'string', format: 'date-time' },
          algorithm:     { type: 'string' },
          assignedCount: { type: 'integer' },
          score:         { type: 'number' },
        },
      },

      TicketTypeBreakdown: {
        type: 'object',
        properties: {
          name:         { type: 'string' },
          price:        { type: 'string' },
          quantityTotal:{ type: 'integer' },
          quantitySold: { type: 'integer' },
          revenue:      { type: 'number' },
        },
      },

      EventAnalytics: {
        type: 'object',
        properties: {
          salesOverTime:      { type: 'array', items: { '$ref': '#/components/schemas/SalesDataPoint' } },
          checkInOverTime:    { type: 'array', items: { '$ref': '#/components/schemas/CheckInDataPoint' } },
          ticketTypeBreakdown:{ type: 'array', items: { '$ref': '#/components/schemas/TicketTypeBreakdown' } },
          revenueTotal:       { type: 'number', example: 2500000 },
          capacityStats:      { '$ref': '#/components/schemas/CapacityStats' },
          allocationHistory:  { type: 'array', items: { '$ref': '#/components/schemas/AllocationHistoryEntry' } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options: swaggerJsdoc.Options = {
  definition,
  apis: [path.join(srcDir, 'modules', '**', '*.routes.ts')],
};

export const swaggerSpec = swaggerJsdoc(options);
