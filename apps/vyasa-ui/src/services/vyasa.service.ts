import type { AgentEventType, AgentStep, ChatResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_PATH ?? '/api';

export interface StreamChunk {
  type: AgentEventType;
  content: string;
}

/**
 * POST /chat — non-streaming, returns full response with agent trace.
 */
export async function sendChat(
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Chat failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ChatResponse>;
}

/**
 * POST /chat/stream — SSE streaming with agent reasoning steps.
 * Calls onChunk for each SSE event, resolves with final session_id.
 */
export async function sendChatStream(
  message: string,
  sessionId: string | undefined,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Stream failed (${res.status}): ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let resolvedSessionId = sessionId ?? '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event.split('\n');
        let eventType: AgentEventType | null = null;
        let dataLine: string | null = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim() as AgentEventType;
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6).trim();
          }
        }

        if (!eventType || !dataLine || dataLine === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataLine) as Record<string, unknown>;

          if (typeof parsed.session_id === 'string') {
            resolvedSessionId = parsed.session_id;
          }

          // Extract human-readable content based on event type
          let content = '';
          if (eventType === 'message') {
            content = (parsed.chunk as string) ?? '';
          } else if (eventType === 'thought') {
            content = (parsed.thought as string) ?? '';
          } else if (eventType === 'action') {
            const tool = (parsed.tool as string) ?? '';
            const input = parsed.input ?? '';
            content = tool
              ? `${tool}: ${typeof input === 'string' ? input : JSON.stringify(input)}`
              : JSON.stringify(parsed);
          } else if (eventType === 'observation') {
            const chunks = parsed.chunks ?? '';
            content = `Retrieved ${chunks} chunk(s)`;
          } else if (eventType === 'reflection') {
            content =
              (parsed.reasoning as string) ??
              (parsed.complete ? 'Sufficient context' : 'Needs more context');
          } else if (eventType === 'done') {
            content = '';
          } else {
            content = JSON.stringify(parsed);
          }

          onChunk({ type: eventType, content });

          if (eventType === 'done') break;
        } catch {
          // malformed SSE event — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return resolvedSessionId;
}

/**
 * GET /health — returns service health status.
 */
export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json() as Promise<{ status: string }>;
}

export function agentStepFromChunk(chunk: StreamChunk): AgentStep {
  return { type: chunk.type, content: chunk.content, timestamp: Date.now() };
}
