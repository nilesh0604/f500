import { Request, Response, NextFunction } from 'express';
import { recordRedMetrics } from '@orderflow/logger';

const normalizeRoute = (req: Request): string => {
  const base = req.route?.path ?? req.path ?? 'unknown';
  return `${req.baseUrl ?? ''}${base}`.replace(/\/:[^/]+/g, '/:id') || '/';
};

export const redMetricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  res.on('finish', () => {
    const route = normalizeRoute(req);
    recordRedMetrics({
      route,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    }).catch(() => {});
  });

  next();
};
