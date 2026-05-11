import express, { Express } from 'express';
import { httpLogMiddleware } from '@orderflow/logger';

export const createTestApp = (...routers: express.Router[]): Express => {
  const app = express();
  app.use(express.json());
  app.use(httpLogMiddleware);
  routers.forEach(router => app.use(router));
  return app;
};
