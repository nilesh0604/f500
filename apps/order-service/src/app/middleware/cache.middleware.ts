import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@orderflow/logger';

const log = createLogger('order-service:cache');

let redisClient: RedisClientType | null = null;

const getRedisClient = (): RedisClientType | null => {
  if (process.env['NODE_ENV'] === 'test') return null;
  if (redisClient) return redisClient;

  redisClient = createClient({
    socket: {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      connectTimeout: 5000,
    },
  }) as RedisClientType;

  redisClient.on('error', (err: Error) =>
    log.warn('Redis client error', { err: err.message })
  );

  redisClient
    .connect()
    .catch((err: Error) =>
      log.warn('Redis connect failed — cache disabled', { err: err.message })
    );

  return redisClient;
};

const CACHE_TTL_SECONDS = 30;

/**
 * Response-level cache for GET /v1/orders.
 * Key: `cache:orders:{userId}:{querystring}`.
 * Sets Cache-Control: private, max-age=30 on cache hits.
 */
export const ordersCacheMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.method !== 'GET') {
    next();
    return;
  }

  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    next();
    return;
  }

  const client = getRedisClient();
  if (!client?.isReady) {
    next();
    return;
  }

  const qs = new URLSearchParams(
    req.query as Record<string, string>
  ).toString();
  const cacheKey = `cache:orders:${userId}:${qs}`;

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', `private, max-age=${CACHE_TTL_SECONDS}`);
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json(JSON.parse(cached));
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      if (res.statusCode === 200 && client.isReady) {
        client
          .setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(body))
          .catch((err: Error) =>
            log.warn('Cache set failed', { err: err.message })
          );
      }
      res.setHeader('Cache-Control', `private, max-age=${CACHE_TTL_SECONDS}`);
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };
  } catch (err) {
    log.warn('Cache lookup failed', { err: (err as Error).message });
  }

  next();
};

/**
 * Invalidates all cached order lists for the given userId.
 * Called after order creation or status update.
 */
export const invalidateOrdersCache = async (userId: string): Promise<void> => {
  const client = getRedisClient();
  if (!client?.isReady) return;

  try {
    const pattern = `cache:orders:${userId}:*`;
    let cursor = 0;
    do {
      const result = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await client.del(result.keys);
      }
    } while (cursor !== 0);
  } catch (err) {
    log.warn('Cache invalidation failed', { err: (err as Error).message });
  }
};
