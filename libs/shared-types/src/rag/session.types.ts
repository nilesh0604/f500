/**
 * Session types for Vyasa RAG Service
 * Aligned with PRD §3.3 Session Management
 */

/**
 * Chat message in session history
 */
export interface Message {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional citations (for assistant messages) */
  citations?: import('./chat.types').Citation[];
}

/**
 * Session data structure
 */
export interface Session {
  /** Unique session ID */
  session_id: string;
  /** Chat history */
  messages: Message[];
  /** Session creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** TTL timestamp for DynamoDB (epoch seconds) */
  ttl: number;
  /** Optional agent trace for last interaction */
  last_agent_trace?: import('./chat.types').AgentStep[];
}

/**
 * DynamoDB session item (for storage)
 */
export interface SessionItem {
  /** Partition key */
  session_id: string;
  /** Serialized session data */
  data: string;
  /** TTL timestamp */
  ttl: number;
  /** Last updated timestamp */
  updated_at: string;
}

/**
 * Rate limit entry for DynamoDB
 */
export interface RateLimitEntry {
  /** Rate limit key (IP or API key) */
  key: string;
  /** Request count for current window */
  count: number;
  /** Window start timestamp */
  window_start: string;
  /** TTL timestamp */
  ttl: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheck {
  /** Whether request is allowed */
  allowed: boolean;
  /** Seconds to wait before retry (if not allowed) */
  retry_after?: number;
  /** Remaining requests in current window */
  remaining?: number;
}
