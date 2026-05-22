/**
 * Human feedback collection system
 * Captures user ratings and feedback for continuous improvement
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { HumanFeedback, ChatResponse } from '../src/types';
import { logger } from '../src/lib/logger';

const ddbClient = new DynamoDBClient({});
const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE || 'vyasa-rag-feedback-dev';

/**
 * Submit user feedback
 */
export async function submitFeedback(
  sessionId: string,
  query: string,
  response: ChatResponse,
  rating: 1 | 2 | 3 | 4 | 5,
  helpful: boolean,
  accurate: boolean,
  comments?: string
): Promise<void> {
  const feedback: HumanFeedback = {
    sessionId,
    query,
    response: response.response,
    rating,
    helpful,
    accurate,
    comments,
    timestamp: new Date().toISOString(),
  };

  await ddbClient.send(
    new PutItemCommand({
      TableName: FEEDBACK_TABLE,
      Item: {
        session_id: { S: feedback.sessionId },
        timestamp: { S: feedback.timestamp },
        query: { S: feedback.query },
        response: { S: feedback.response },
        rating: { N: String(feedback.rating) },
        helpful: { BOOL: feedback.helpful },
        accurate: { BOOL: feedback.accurate },
        comments: feedback.comments ? { S: feedback.comments } : undefined,
        citations_count: { N: String(response.citations.length) },
        token_usage: response.token_usage
          ? { N: String(response.token_usage.total_tokens) }
          : undefined,
      },
    })
  );

  logger.info('Feedback submitted', {
    sessionId,
    rating,
    helpful,
    accurate,
  });
}

/**
 * Get feedback statistics
 */
export async function getFeedbackStats(days: number = 30): Promise<{
  total: number;
  avgRating: number;
  helpfulRate: number;
  accurateRate: number;
  byRating: Record<number, number>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result = await ddbClient.send(
    new QueryCommand({
      TableName: FEEDBACK_TABLE,
      KeyConditionExpression: '#ts > :since',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':since': { S: since },
      },
    })
  );

  const items = result.Items || [];

  if (items.length === 0) {
    return {
      total: 0,
      avgRating: 0,
      helpfulRate: 0,
      accurateRate: 0,
      byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const ratings = items.map(i => parseInt(i.rating.N || '3', 10));
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  const helpfulCount = items.filter(i => i.helpful.BOOL).length;
  const accurateCount = items.filter(i => i.accurate.BOOL).length;

  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) {
    byRating[r] = (byRating[r] || 0) + 1;
  }

  return {
    total: items.length,
    avgRating,
    helpfulRate: helpfulCount / items.length,
    accurateRate: accurateCount / items.length,
    byRating,
  };
}

/**
 * Get low-rated feedback for review
 */
export async function getLowRatedFeedback(
  minRating: number = 3,
  limit: number = 20
): Promise<Array<HumanFeedback & { citationsCount: number }>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Note: This would need a GSI on rating in production
  // For now, scanning with filter
  const result = await ddbClient.send(
    new QueryCommand({
      TableName: FEEDBACK_TABLE,
      KeyConditionExpression: '#ts > :since',
      FilterExpression: 'rating <= :maxRating',
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':since': { S: since },
        ':maxRating': { N: String(minRating) },
      },
      Limit: { N: String(limit) },
    })
  );

  return (result.Items || []).map(item => ({
    sessionId: item.session_id.S || '',
    query: item.query.S || '',
    response: item.response.S || '',
    rating: parseInt(item.rating.N || '3', 10) as 1 | 2 | 3 | 4 | 5,
    helpful: item.helpful.BOOL || false,
    accurate: item.accurate.BOOL || false,
    comments: item.comments?.S,
    timestamp: item.timestamp.S || '',
    citationsCount: parseInt(item.citations_count.N || '0', 10),
  }));
}

/**
 * Export feedback to CSV for analysis
 */
export async function exportFeedbackToCSV(
  days: number = 30,
  outputPath?: string
): Promise<string> {
  const stats = await getFeedbackStats(days);
  const lowRated = await getLowRatedFeedback(3, 50);

  const lines = [
    'timestamp,query,rating,helpful,accurate,comments',
    ...lowRated.map(
      f =>
        `"${f.timestamp}","${f.query.replace(/"/g, '""')}",${f.rating},${f.helpful},${f.accurate},"${(
          f.comments || ''
        ).replace(/"/g, '""')}"`
    ),
  ];

  const csv = lines.join('\n');

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, csv);
    logger.info(`Feedback exported to ${outputPath}`);
  }

  return csv;
}

/**
 * Get feedback summary for dashboard
 */
export async function getFeedbackDashboardData(): Promise<{
  last24h: { count: number; avgRating: number };
  last7d: { count: number; avgRating: number };
  last30d: {
    count: number;
    avgRating: number;
    trend: 'up' | 'down' | 'stable';
  };
  topIssues: string[];
}> {
  const now = Date.now();

  const [stats24h, stats7d, stats30d] = await Promise.all([
    getFeedbackStats(1),
    getFeedbackStats(7),
    getFeedbackStats(30),
  ]);

  // Calculate trend (compare last 7 days vs previous 7 days)
  // This is simplified - in production would compare actual periods
  const trend: 'up' | 'down' | 'stable' =
    stats30d.avgRating > 4 ? 'up' : stats30d.avgRating < 3 ? 'down' : 'stable';

  // Get common issues from comments
  const lowRated = await getLowRatedFeedback(2, 20);
  const comments = lowRated.filter(f => f.comments).map(f => f.comments!);

  // Simple keyword extraction for issues
  const issueKeywords = [
    'wrong',
    'incorrect',
    'bad',
    'poor',
    'missing',
    'incomplete',
    'error',
  ];
  const topIssues = comments
    .filter(c => issueKeywords.some(kw => c.toLowerCase().includes(kw)))
    .slice(0, 5);

  return {
    last24h: {
      count: stats24h.total,
      avgRating: stats24h.avgRating,
    },
    last7d: {
      count: stats7d.total,
      avgRating: stats7d.avgRating,
    },
    last30d: {
      count: stats30d.total,
      avgRating: stats30d.avgRating,
      trend,
    },
    topIssues,
  };
}
