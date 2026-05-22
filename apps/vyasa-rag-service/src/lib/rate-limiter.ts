/**
 * Token bucket rate limiter using DynamoDB
 * Supports per-IP and global rate limits
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetItemCommand,
  UpdateItemCommand,
  PutItemCommand,
} from '@aws-sdk/lib-dynamodb';
import { RateLimitCheck } from '../types';
import { logger } from './logger';

const ddbClient = new DynamoDBClient({});
const RATE_LIMITS_TABLE =
  process.env.RATE_LIMITS_TABLE || 'vyasa-rag-rate-limits-dev';

/**
 * Check rate limit for a key (IP or API key)
 */
export async function checkRateLimit(
  key: string,
  limits: { perMinute: number; perHour: number }
): Promise<RateLimitCheck> {
  const now = new Date();
  const minuteWindow = `${now.toISOString().slice(0, 16)}`; // YYYY-MM-DDTHH:mm
  const hourWindow = `${now.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH

  const minuteKey = `${key}:min:${minuteWindow}`;
  const hourKey = `${key}:hour:${hourWindow}`;

  try {
    // Check per-minute limit
    const minuteResult = await getRateLimitEntry(minuteKey);
    const minuteCount = minuteResult?.count || 0;

    if (minuteCount >= limits.perMinute) {
      return {
        allowed: false,
        retry_after: 60 - now.getSeconds(),
        remaining: 0,
      };
    }

    // Check per-hour limit
    const hourResult = await getRateLimitEntry(hourKey);
    const hourCount = hourResult?.count || 0;

    if (hourCount >= limits.perHour) {
      return {
        allowed: false,
        retry_after: 3600 - (now.getMinutes() * 60 + now.getSeconds()),
        remaining: 0,
      };
    }

    // Increment counters
    await incrementRateLimit(minuteKey, 60);
    await incrementRateLimit(hourKey, 3600);

    return {
      allowed: true,
      remaining: Math.min(
        limits.perMinute - minuteCount - 1,
        limits.perHour - hourCount - 1
      ),
    };
  } catch (error) {
    logger.error('Rate limit check failed', { error, key });
    // Fail open - allow request on error
    return { allowed: true };
  }
}

/**
 * Check global rate limit
 */
export async function checkGlobalRateLimit(
  maxRequests: number
): Promise<RateLimitCheck> {
  const now = new Date();
  const windowKey = `global:${now.toISOString().slice(0, 16)}`;

  try {
    const result = await getRateLimitEntry(windowKey);
    const count = result?.count || 0;

    if (count >= maxRequests) {
      return {
        allowed: false,
        retry_after: 60 - now.getSeconds(),
        remaining: 0,
      };
    }

    await incrementRateLimit(windowKey, 60);

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
    };
  } catch (error) {
    logger.error('Global rate limit check failed', { error });
    return { allowed: true };
  }
}

/**
 * Get current count for a rate limit key
 */
async function getRateLimitEntry(
  key: string
): Promise<{ count: number } | null> {
  const result = await ddbClient.send(
    new GetItemCommand({
      TableName: RATE_LIMITS_TABLE,
      Key: { key: { S: key } },
    })
  );

  if (!result.Item) {
    return null;
  }

  return {
    count: parseInt(result.Item.count.N || '0', 10),
  };
}

/**
 * Increment rate limit counter with TTL
 */
async function incrementRateLimit(
  key: string,
  ttlSeconds: number
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: RATE_LIMITS_TABLE,
      Key: { key: { S: key } },
      UpdateExpression:
        'SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':inc': { N: '1' },
        ':ttl': { N: ttl.toString() },
      },
    })
  );
}

/**
 * Default rate limits from environment
 */
export function getDefaultRateLimits(): {
  perMinute: number;
  perHour: number;
  global: number;
} {
  return {
    perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10', 10),
    perHour: parseInt(process.env.RATE_LIMIT_PER_HOUR || '100', 10),
    global: parseInt(process.env.GLOBAL_RATE_LIMIT || '100', 10),
  };
}
