import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRateLimiter, globalRateLimiter } from './middleware/rateLimiter.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';
import { venuesRouter } from './modules/venues/venues.routes.js';
import { checkinRouter } from './modules/checkin/checkin.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { healthRouter } from './modules/health/health.routes.js';

export const app: Application = express();

// ─── Request logger (first — captures every request including errors) ─────────
app.use(requestLogger);

// ─── Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'res.cloudinary.com'],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  }),
);

// ─── Body + cookie parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Health check — before rate limiter; never blocked by auth or rate limit ──
app.use(healthRouter);

// ─── Global rate limiter ─────────────────────────────────────────────────────
app.use('/api', globalRateLimiter);

// ─── Swagger UI (development only) ───────────────────────────────────────────
if (env.NODE_ENV !== 'production') {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'EventFlow API Docs',
      swaggerOptions: { persistAuthorization: true },
    }),
  );
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRateLimiter, authRouter);
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/venues', venuesRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/checkin', checkinRouter);
app.use('/api/v1/admin', adminRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);
