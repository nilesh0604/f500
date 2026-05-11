import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { httpLogMiddleware } from '@orderflow/logger';
import { authRouter } from './routes/auth.router';
import { ordersRouter } from './routes/orders.router';
import { healthRouter } from './routes/health.router';

export const createApp = (): Express => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(httpLogMiddleware);

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
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
