import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '@orderflow/auth';
import rateLimit from 'express-rate-limit';

const getAllowedOrigins = (): string[] =>
  (process.env['CORS_ORIGIN'] ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

/**
 * Strict CORS — allowlist-only; falls back to deny-all in production if
 * CORS_ORIGIN is not set.
 */
export const strictCors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const origin = req.headers['origin'];
  const ALLOWED_ORIGINS = getAllowedOrigins();
  const isPreflight = req.method === 'OPTIONS';

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PATCH,DELETE,OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Correlation-Id,Idempotency-Key'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  } else if (!origin) {
    // Same-origin / server-to-server — allow
  } else {
    if (isPreflight) {
      res.status(403).end();
      return;
    }
  }

  if (isPreflight) {
    res.status(204).end();
    return;
  }

  next();
};

/**
 * Content-Security-Policy + supplementary security headers beyond what
 * Helmet provides by default.
 */
export const securityHeaders = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  const env = process.env['NODE_ENV'] ?? 'development';
  const isProd = env === 'production';

  const cspDirectives = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    'block-all-mixed-content',
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  if (isProd) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  next();
};

/**
 * Per-user rate limiter applied after authentication.
 * More generous than the IP-level limiter in app.ts (200 req / 15 min).
 */
export const perUserRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req: Request): string =>
    (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please retry after 15 minutes.',
  },
  skip: (req: Request): boolean =>
    req.path === '/health' || req.path === '/ready' || req.path === '/live',
});

/**
 * Request-size guard — blocks payloads beyond 100 KB for mutation endpoints.
 */
export const requestSizeGuard = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  const MAX_BYTES = 100 * 1024;
  if (
    contentLength > MAX_BYTES &&
    ['POST', 'PUT', 'PATCH'].includes(req.method)
  ) {
    res.status(413).json({
      error: 'Payload Too Large',
      message: `Request body must not exceed ${MAX_BYTES / 1024} KB`,
    });
    return;
  }
  next();
};
