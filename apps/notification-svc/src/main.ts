import { startSqsConsumer } from './app/consumers/sqs.consumer';
import { createWsServer } from './app/ws/ws.server';
import { createApp } from './app/app';
import { createLogger } from '@orderflow/logger';
import * as http from 'http';

const log = createLogger('notification-svc');
const PORT = process.env['PORT'] ?? '3002';

const start = async (): Promise<void> => {
  const app = createApp();
  const server = http.createServer(app);
  createWsServer(server);

  server.listen(PORT, () => {
    log.info(`Notification Service listening on port ${PORT}`);
  });

  const consumer = startSqsConsumer();

  const shutdown = async (): Promise<void> => {
    log.info('SIGTERM — graceful shutdown');
    consumer.stop();
    server.close(() => {
      log.info('HTTP server closed — exiting');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch(err => {
  log.error('Failed to start Notification Service', { err });
  process.exit(1);
});
