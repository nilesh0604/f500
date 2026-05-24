export type AgentEventType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'reflection'
  | 'message'
  | 'done'
  | 'error';

export interface AgentStep {
  type: AgentEventType;
  content: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentSteps?: AgentStep[];
  isStreaming?: boolean;
  error?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

export interface ChatRequest {
  session_id?: string;
  message: string;
}

export interface ChatResponse {
  session_id: string;
  answer: string;
  agent_trace?: AgentStep[];
}
