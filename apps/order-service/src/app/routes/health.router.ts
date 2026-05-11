import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.client';

export const healthRouter = Router();

const VERSION = process.env['npm_package_version'] ?? '0.0.0';

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks: { database: 'ok' },
    });
  } catch {
    res.status(503).json({
      status: 'down',
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks: { database: 'down' },
    });
  }
});
