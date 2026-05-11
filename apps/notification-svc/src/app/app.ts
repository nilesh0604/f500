import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import { httpLogMiddleware } from '@orderflow/logger';
import { healthRouter } from './routes/health.router';

export const createApp = (): Express => {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use(httpLogMiddleware);
  app.use('/', healthRouter);
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });
  return app;
};
