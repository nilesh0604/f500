/**
 * Unit tests for Session Store
 */

import {
  getOrCreateSession,
  getSession,
  saveSession,
  addMessageToSession,
} from '../../src/services/session-store';
import { Session, Message } from '../../src/types';
import {
  mockDynamoDbClient,
  resetAwsMocks,
  setupMockSessionGet,
} from '../__mocks__/aws-sdk';

// Mock the DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('SessionStore', () => {
  beforeEach(() => {
    resetAwsMocks();
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
      setupMockSessionGet(mockSession);

      const result = await getOrCreateSession('test-session-id');

      expect(result.session_id).toBe('test-session-id');
    });

    it('should create new session if not found', async () => {
      setupMockSessionGet(undefined);

      const result = await getOrCreateSession('non-existent-id');

      expect(result.session_id).toBeDefined();
      expect(result.session_id).not.toBe('non-existent-id'); // New UUID generated
      expect(result.messages).toEqual([]);
    });

    it('should create new session if no session_id provided', async () => {
      const result = await getOrCreateSession();

      expect(result.session_id).toBeDefined();
      expect(result.messages).toEqual([]);
    });
  });

  describe('getSession', () => {
    it('should return session if exists', async () => {
      setupMockSessionGet(mockSession);

      const result = await getSession('test-session-id');

      expect(result).toBeDefined();
      expect(result?.session_id).toBe('test-session-id');
    });

    it('should return null if session not found', async () => {
      mockDynamoDbClient.send.mockResolvedValue({ Item: undefined });

      const result = await getSession('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('should save session to DynamoDB', async () => {
      mockDynamoDbClient.send.mockResolvedValue({});

      await saveSession(mockSession);

      expect(mockDynamoDbClient.send).toHaveBeenCalled();
    });
  });

  describe('addMessageToSession', () => {
    it('should add message to existing session', async () => {
      const sessionWithMessages: Session = {
        ...mockSession,
        messages: [],
      };

      setupMockSessionGet(sessionWithMessages);
      mockDynamoDbClient.send.mockResolvedValue({});

      const message: Message = {
        role: 'user',
        content: 'Who was Karna?',
        timestamp: '2026-05-22T12:01:00Z',
      };

      await addMessageToSession('test-session-id', message);

      expect(mockDynamoDbClient.send).toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      mockDynamoDbClient.send.mockResolvedValue({ Item: undefined });

      const message: Message = {
        role: 'user',
        content: 'Test',
        timestamp: '2026-05-22T12:01:00Z',
      };

      await expect(
        addMessageToSession('non-existent-id', message)
      ).rejects.toThrow('Session not found');
    });
  });
});
