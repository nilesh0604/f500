import express, { Express } from 'express';

export const createTestApp = (...routers: express.Router[]): Express => {
  const app = express();
  app.use(express.json());
  routers.forEach(router => app.use(router));
  return app;
};
