import { Router, Request, Response } from 'express';

export const healthRouter = Router();

const VERSION = process.env['npm_package_version'] ?? '0.0.0';

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});

healthRouter.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});
