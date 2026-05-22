/**
 * DynamoDB session management
 * Stores chat history with TTL
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Session, Message, SessionItem } from '../types';
import { logger } from '../lib/logger';
import { dynamodbCircuitBreaker } from '../lib/circuit-breaker';

const ddbClient = new DynamoDBClient({});
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'vyasa-rag-sessions-dev';
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '7', 10);

/**
 * Get or create a session
 */
export async function getOrCreateSession(sessionId?: string): Promise<Session> {
  return dynamodbCircuitBreaker.execute(async () => {
    if (sessionId) {
      const session = await getSession(sessionId);
      if (session) {
        logger.debug('Retrieved existing session', { sessionId });
        return session;
      }
    }

    // Create new session
    const newSession: Session = {
      session_id: uuidv4(),
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 24 * 60 * 60,
    };

    await saveSession(newSession);
    logger.info('Created new session', { sessionId: newSession.session_id });

    return newSession;
  });
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  return dynamodbCircuitBreaker.execute(async () => {
    const result = await ddbClient.send(
      new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id: sessionId },
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = result.Item as SessionItem;
    return JSON.parse(item.data);
  });
}

/**
 * Save session to DynamoDB
 */
export async function saveSession(session: Session): Promise<void> {
  return dynamodbCircuitBreaker.execute(async () => {
    const item: SessionItem = {
      session_id: session.session_id,
      data: JSON.stringify(session),
      ttl: session.ttl,
      updated_at: session.updated_at,
    };

    await ddbClient.send(
      new PutCommand({
        TableName: SESSIONS_TABLE,
        Item: item as unknown as Record<string, unknown>,
      })
    );
  });
}

/**
 * Add message to session
 */
export async function addMessageToSession(
  sessionId: string,
  message: Message,
  agentTrace?: unknown[]
): Promise<void> {
  return dynamodbCircuitBreaker.execute(async () => {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.messages.push(message);
    session.updated_at = new Date().toISOString();

    if (agentTrace) {
      session.last_agent_trace = agentTrace;
    }

    await saveSession(session);
    logger.debug('Added message to session', {
      sessionId,
      messageCount: session.messages.length,
    });
  });
}

/**
 * Get session messages for context
 */
export async function getSessionMessages(
  sessionId: string
): Promise<Message[]> {
  const session = await getSession(sessionId);
  return session?.messages || [];
}
