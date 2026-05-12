import { initTracing, createLogger } from '@orderflow/logger';

initTracing('order-service');

import { createApp } from './app/app';
import { prisma } from './app/db/prisma.client';

const log = createLogger('order-service');
const PORT = process.env['PORT'] ?? '3001';

const start = async (): Promise<void> => {
  await prisma.$connect();
  log.info('Database connected');

  const app = createApp();

  const server = app.listen(PORT, () => {
    log.info(`Order Service listening on port ${PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    log.info('SIGTERM received — graceful shutdown initiated');
    server.close(async () => {
      await prisma.$disconnect();
      log.info('Database disconnected — exiting');
      process.exit(0);
    });
    setTimeout(() => {
      log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch(err => {
  log.error('Failed to start Order Service', { err });
  process.exit(1);
});
