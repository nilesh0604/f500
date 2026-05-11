import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export const httpLogMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? uuidv4();
  const start = Date.now();

  res.setHeader('x-correlation-id', correlationId);
  (req as Request & { correlationId: string }).correlationId = correlationId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      correlationId,
    });
  });

  next();
};
