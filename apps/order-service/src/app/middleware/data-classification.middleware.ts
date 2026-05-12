import { Request, Response, NextFunction } from 'express';

/**
 * Data Classification Matrix (Fortune 500 / SOC 2 aligned)
 *
 * Public     — no restrictions, freely shareable
 * Internal   — internal-only, not for external parties
 * Confidential — need-to-know, encrypted at rest + in transit
 * Restricted  — highest sensitivity (PII, credentials), strict access controls
 */
export type DataClassification =
  | 'Public'
  | 'Internal'
  | 'Confidential'
  | 'Restricted';

const ROUTE_CLASSIFICATION: Record<string, DataClassification> = {
  '/health': 'Public',
  '/ready': 'Public',
  '/live': 'Public',
  '/v1/auth/register': 'Restricted',
  '/v1/auth/login': 'Restricted',
  '/v1/auth/me': 'Restricted',
  '/v1/orders': 'Confidential',
};

const classifyRoute = (path: string): DataClassification => {
  if (ROUTE_CLASSIFICATION[path]) return ROUTE_CLASSIFICATION[path];
  if (path.startsWith('/v1/orders')) return 'Confidential';
  if (path.startsWith('/v1/auth')) return 'Restricted';
  return 'Internal';
};

/**
 * Attaches X-Data-Classification response header based on route sensitivity.
 * Logged by the HTTP middleware to create an auditable data-flow trail.
 */
export const dataClassificationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const classification = classifyRoute(req.path);
  res.setHeader('X-Data-Classification', classification);
  (
    req as Request & { dataClassification: DataClassification }
  ).dataClassification = classification;
  next();
};

/**
 * PII field inventory — used for audit log enrichment.
 * Maps domain entity fields to their classification and applicable regulation.
 */
export const PII_FIELD_REGISTRY: Record<
  string,
  { classification: DataClassification; regulation: string[] }
> = {
  email: {
    classification: 'Restricted',
    regulation: ['GDPR Art.4', 'CCPA'],
  },
  emailHash: {
    classification: 'Restricted',
    regulation: ['GDPR Art.4'],
  },
  passwordHash: {
    classification: 'Restricted',
    regulation: ['GDPR Art.32'],
  },
  consentTimestamp: {
    classification: 'Confidential',
    regulation: ['GDPR Art.7'],
  },
  phone: {
    classification: 'Restricted',
    regulation: ['GDPR Art.4', 'CCPA'],
  },
  address: {
    classification: 'Restricted',
    regulation: ['GDPR Art.4'],
  },
  userId: {
    classification: 'Confidential',
    regulation: ['GDPR Art.4'],
  },
  ipAddress: {
    classification: 'Confidential',
    regulation: ['GDPR Art.4'],
  },
};
