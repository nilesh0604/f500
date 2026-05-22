/**
 * Chat types for Vyasa RAG Service
 * Aligned with OpenAPI spec: docs/api/vyasa-rag.yaml
 */

/**
 * Chat request from client
 */
export interface ChatRequest {
  /** Session ID for continuing a conversation. Omit to create a new session. */
  session_id?: string;
  /** User message to send to the RAG service */
  message: string;
  /** Whether to stream the response (used internally, prefer /chat/stream endpoint) */
  stream?: boolean;
}

/**
 * Chat response from service
 */
export interface ChatResponse {
  /** Session ID (new or existing) */
  session_id: string;
  /** Generated response from the LLM */
  response: string;
  /** Citations from the Mahabharata supporting the response */
  citations: Citation[];
  /** Token usage statistics */
  token_usage?: TokenUsage;
  /** Agent trace (optional, for debugging agentic flow) */
  agent_trace?: AgentStep[];
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Number of tokens in the prompt */
  prompt_tokens: number;
  /** Number of tokens in the completion */
  completion_tokens: number;
  /** Total tokens used */
  total_tokens: number;
}

/**
 * Citation from retrieved documents
 */
export interface Citation {
  /** Title of the source text */
  title: string;
  /** Book/Parva name */
  book?: string;
  /** Chapter name */
  chapter?: string;
  /** Verse reference if available */
  verse?: string;
  /** Relevance score (0.0 - 1.0) */
  score?: number;
}

/**
 * Agent step for tracing agentic reasoning
 */
export interface AgentStep {
  /** Step number in the agent loop */
  step: number;
  /** Type of step */
  type: 'thought' | 'action' | 'observation' | 'reflection';
  /** Content of the step */
  content: string;
  /** Tool used (for action steps) */
  tool?: string;
  /** Tool input (for action steps) */
  tool_input?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * SSE event types for streaming
 */
export type StreamEventType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'reflection'
  | 'message'
  | 'citation'
  | 'error'
  | 'done';

/**
 * Base SSE event structure
 */
export interface StreamEvent {
  event: StreamEventType;
  data: unknown;
}

/**
 * Thought event (agent reasoning)
 */
export interface ThoughtEvent extends StreamEvent {
  event: 'thought';
  data: {
    thought: string;
  };
}

/**
 * Action event (tool invocation)
 */
export interface ActionEvent extends StreamEvent {
  event: 'action';
  data: {
    tool: string;
    input: string;
  };
}

/**
 * Observation event (retrieved results)
 */
export interface ObservationEvent extends StreamEvent {
  event: 'observation';
  data: {
    chunks: number;
    sources: string[];
  };
}

/**
 * Reflection event (self-evaluation)
 */
export interface ReflectionEvent extends StreamEvent {
  event: 'reflection';
  data: {
    complete: boolean;
    reasoning?: string;
  };
}

/**
 * Message event (response chunk)
 */
export interface MessageEvent extends StreamEvent {
  event: 'message';
  data: {
    session_id: string;
    chunk: string;
  };
}

/**
 * Done event (stream complete)
 */
export interface DoneEvent extends StreamEvent {
  event: 'done';
  data: {
    citations: Citation[];
    token_usage: TokenUsage;
  };
}

/**
 * Error event
 */
export interface ErrorEvent extends StreamEvent {
  event: 'error';
  data: {
    code: string;
    message: string;
  };
}
