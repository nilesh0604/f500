import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { httpLogMiddleware } from '@orderflow/logger';
import { authRouter } from './routes/auth.router';
import { ordersRouter } from './routes/orders.router';
import { healthRouter } from './routes/health.router';
import { redMetricsMiddleware } from './middleware/red-metrics.middleware';
import {
  strictCors,
  securityHeaders,
  requestSizeGuard,
} from './middleware/security.middleware';
import { dataClassificationMiddleware } from './middleware/data-classification.middleware';

export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(strictCors);
  app.use(securityHeaders);
  app.use(dataClassificationMiddleware);
  app.use(requestSizeGuard);
  app.use(express.json({ limit: '100kb' }));
  app.use(httpLogMiddleware);
  app.use(redMetricsMiddleware);

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req: Request): boolean =>
        req.path === '/health' || req.path === '/ready' || req.path === '/live',
    })
  );

  app.use('/', healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/orders', ordersRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', message: 'Route not found' });
  });

  return app;
};
