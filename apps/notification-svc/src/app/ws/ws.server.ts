import { Server as HttpServer } from 'http';
import { Server as IoServer, Socket } from 'socket.io';
import { createLogger } from '@orderflow/logger';

const log = createLogger('notification-svc:ws');

let io: IoServer | null = null;

export const createWsServer = (server: HttpServer): IoServer => {
  io = new IoServer(server, {
    cors: { origin: process.env['CORS_ORIGIN'] ?? '*' },
    transports: ['websocket'],
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.handshake.auth['userId'] as string | undefined;
    if (!userId) {
      log.warn('WS connection rejected — no userId', { socketId: socket.id });
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${userId}`);
    log.info('WS client connected', { userId, socketId: socket.id });

    socket.on('disconnect', () => {
      log.info('WS client disconnected', { userId, socketId: socket.id });
    });
  });

  return io;
};

export const pushToUser = (
  userId: string,
  event: string,
  data: unknown
): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
  log.debug('WS push sent', { userId, event });
};
