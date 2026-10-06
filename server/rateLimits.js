// server/rateLimits.js
//
// Per-IP rate limits for public endpoints (odd/adhesion-activation-recovery).
// In-memory store: the backend runs as a single Coolify instance. Running
// several replicas would need a shared store (e.g. Redis) to keep the limit.
// Client IPs come from req.ip, which relies on server.js trusting exactly one
// proxy hop (`app.set('trust proxy', 1)`, Coolify's Traefik).

import { rateLimit } from 'express-rate-limit';

/** POST /api/adhesion/:id/activate: anonymous and runs a full duplicate scan. */
export const ACTIVATE_ADHESION_RATE_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 10 });

/**
 * @param {{ windowMs?: number, limit?: number }} [overrides] for tests
 * @returns {import('express').RequestHandler}
 */
export function createActivateAdhesionLimiter(overrides = {}) {
  return rateLimit({
    ...ACTIVATE_ADHESION_RATE_LIMIT,
    ...overrides,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    statusCode: 429,
    message: { error: 'Demasiados intentos de activación. Esperá unos minutos y volvé a intentar.' },
  });
}
