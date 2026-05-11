import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt.service';
import { logger } from '@orderflow/logger';

export interface AuthRequest extends Request {
  userId: string;
  userEmail: string;
  correlationId: string;
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
      correlationId: (req as AuthRequest).correlationId ?? '',
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).userId = payload.sub;
    (req as AuthRequest).userEmail = payload.email;
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { err });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      correlationId: (req as AuthRequest).correlationId ?? '',
    });
  }
};
