/**
 * Unit tests for validators
 */

import {
  validateChatRequest,
  safeValidateChatRequest,
} from '../../src/lib/validators';

describe('Validators', () => {
  describe('validateChatRequest', () => {
    it('should validate a valid chat request', () => {
      const input = {
        message: 'Who was Karna?',
      };

      const result = validateChatRequest(input);

      expect(result.message).toBe('Who was Karna?');
      expect(result.session_id).toBeUndefined();
      expect(result.stream).toBe(false);
    });

    it('should validate chat request with session_id', () => {
      const input = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Tell me more',
      };

      const result = validateChatRequest(input);

      expect(result.session_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject empty message', () => {
      const input = {
        message: '',
      };

      expect(() => validateChatRequest(input)).toThrow();
    });

    it('should reject message too long', () => {
      const input = {
        message: 'a'.repeat(4001),
      };

      expect(() => validateChatRequest(input)).toThrow();
    });

    it('should reject invalid session_id', () => {
      const input = {
        session_id: 'not-a-uuid',
        message: 'Test',
      };

      expect(() => validateChatRequest(input)).toThrow();
    });
  });

  describe('safeValidateChatRequest', () => {
    it('should return success for valid input', () => {
      const input = { message: 'Test' };
      const result = safeValidateChatRequest(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return failure for invalid input', () => {
      const input = { message: '' };
      const result = safeValidateChatRequest(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('message');
    });
  });
});
