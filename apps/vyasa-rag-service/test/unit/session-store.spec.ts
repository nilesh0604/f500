/**
 * Unit tests for Session Store
 */

// Mock factories are evaluated lazily (when the module is first required).
// All mock setup lives INSIDE the factory to avoid temporal dead zone issues with ts-jest.
jest.mock('@aws-sdk/client-dynamodb', () => {
  const sendFn = jest.fn();
  const MockDynamoDBClient = jest
    .fn()
    .mockImplementation(() => ({ send: sendFn }));
  (MockDynamoDBClient as unknown as Record<string, unknown>).__sendFn = sendFn;
  return { DynamoDBClient: MockDynamoDBClient };
});

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockImplementation(() => ({})),
  },
  GetCommand: jest.fn().mockImplementation((args: unknown) => args),
  PutCommand: jest.fn().mockImplementation((args: unknown) => args),
  UpdateCommand: jest.fn().mockImplementation((args: unknown) => args),
}));

jest.mock('../../src/lib/circuit-breaker', () => ({
  dynamodbCircuitBreaker: {
    execute: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  },
  bedrockCircuitBreaker: {
    execute: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('../../src/lib/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  getOrCreateSession,
  getSession,
  saveSession,
  addMessageToSession,
} from '../../src/services/session-store';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Session, Message } from '../../src/types';

// Access the sendFn that was created inside the mock factory
const mockDdbSend = (DynamoDBClient as unknown as Record<string, unknown>)
  .__sendFn as jest.Mock;

describe('SessionStore', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
  });

  const mockSession: Session = {
    session_id: 'test-session-id',
    messages: [],
    created_at: '2026-05-22T12:00:00Z',
    updated_at: '2026-05-22T12:00:00Z',
    ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };

  describe('getOrCreateSession', () => {
    it('should return existing session if found', async () => {
      mockDdbSend.mockResolvedValue({
        Item: { data: JSON.stringify(mockSession) },
      });

      const result = await getOrCreateSession('test-session-id');

      expect(result.session_id).toBe('test-session-id');
    });

    it('should create new session if not found', async () => {
      mockDdbSend
        .mockResolvedValueOnce({ Item: undefined }) // getSession → not found
        .mockResolvedValue({}); // saveSession → success

      const result = await getOrCreateSession('non-existent-id');

      expect(result.session_id).toBeDefined();
      expect(result.session_id).not.toBe('non-existent-id'); // New UUID generated
      expect(result.messages).toEqual([]);
    });

    it('should create new session if no session_id provided', async () => {
      mockDdbSend.mockResolvedValue({}); // saveSession → success

      const result = await getOrCreateSession();

      expect(result.session_id).toBeDefined();
      expect(result.messages).toEqual([]);
    });
  });

  describe('getSession', () => {
    it('should return session if exists', async () => {
      mockDdbSend.mockResolvedValue({
        Item: { data: JSON.stringify(mockSession) },
      });

      const result = await getSession('test-session-id');

      expect(result).toBeDefined();
      expect(result?.session_id).toBe('test-session-id');
    });

    it('should return null if session not found', async () => {
      mockDdbSend.mockResolvedValue({ Item: undefined });

      const result = await getSession('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('should save session to DynamoDB', async () => {
      mockDdbSend.mockResolvedValue({});

      await saveSession(mockSession);

      expect(mockDdbSend).toHaveBeenCalled();
    });
  });

  describe('addMessageToSession', () => {
    it('should add message to existing session', async () => {
      const sessionWithMessages: Session = {
        ...mockSession,
        messages: [],
      };

      mockDdbSend
        .mockResolvedValueOnce({
          Item: { data: JSON.stringify(sessionWithMessages) },
        }) // getSession
        .mockResolvedValue({}); // saveSession

      const message: Message = {
        role: 'user',
        content: 'Who was Karna?',
        timestamp: '2026-05-22T12:01:00Z',
      };

      await addMessageToSession('test-session-id', message);

      expect(mockDdbSend).toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      mockDdbSend.mockResolvedValue({ Item: undefined });

      const message: Message = {
        role: 'user',
        content: 'Test',
        timestamp: '2026-05-22T12:01:00Z',
      };

      await expect(
        addMessageToSession('non-existent-id', message)
      ).rejects.toThrow('Session not found');
    });

    it('should_saveAgentTrace_when_agentTraceProvided', async () => {
      const sessionWithMessages: Session = { ...mockSession, messages: [] };

      mockDdbSend
        .mockResolvedValueOnce({
          Item: { data: JSON.stringify(sessionWithMessages) },
        })
        .mockResolvedValue({});

      const message: Message = {
        role: 'assistant',
        content: 'Karna was a great warrior.',
        timestamp: '2026-05-22T12:02:00Z',
      };

      const agentTrace = [
        {
          step: 1,
          type: 'thought' as const,
          content: 'analysis',
          timestamp: '2026-05-22T12:02:00Z',
        },
      ];

      await addMessageToSession('test-session-id', message, agentTrace);

      expect(mockDdbSend).toHaveBeenCalled();
    });
  });

  describe('getSessionMessages', () => {
    it('should_returnMessages_when_sessionExists', async () => {
      const sessionWithMessages: Session = {
        ...mockSession,
        messages: [
          { role: 'user', content: 'Hello', timestamp: '2026-05-22T12:00:00Z' },
        ],
      };
      mockDdbSend.mockResolvedValue({
        Item: { data: JSON.stringify(sessionWithMessages) },
      });

      const { getSessionMessages } =
        await import('../../src/services/session-store');
      const messages = await getSessionMessages('test-session-id');
      expect(messages).toHaveLength(1);
    });

    it('should_returnEmptyArray_when_sessionNotFound', async () => {
      mockDdbSend.mockResolvedValue({ Item: undefined });

      const { getSessionMessages } =
        await import('../../src/services/session-store');
      const messages = await getSessionMessages('missing-id');
      expect(messages).toEqual([]);
    });
  });
});
