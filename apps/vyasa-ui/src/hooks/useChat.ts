import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, Session } from '../types';
import { sendChatStream, agentStepFromChunk } from '../services/vyasa.service';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      const assistantId = uuidv4();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentSteps: [],
        isStreaming: true,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      abortRef.current = new AbortController();

      try {
        const resolvedSessionId = await sendChatStream(
          text.trim(),
          activeSessionId,
          chunk => {
            setMessages(prev =>
              prev.map(m => {
                if (m.id !== assistantId) return m;

                if (chunk.type === 'message') {
                  return { ...m, content: m.content + chunk.content };
                }

                if (chunk.type === 'done') {
                  return m;
                }

                return {
                  ...m,
                  agentSteps: [
                    ...(m.agentSteps ?? []),
                    agentStepFromChunk(chunk),
                  ],
                };
              })
            );
          },
          abortRef.current.signal
        );

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );

        if (resolvedSessionId && resolvedSessionId !== activeSessionId) {
          setActiveSessionId(resolvedSessionId);

          setSessions(prev => {
            const existing = prev.find(s => s.id === resolvedSessionId);
            const now = Date.now();
            if (existing) {
              return prev.map(s =>
                s.id === resolvedSessionId
                  ? {
                      ...s,
                      lastMessageAt: now,
                      messageCount: s.messageCount + 1,
                    }
                  : s
              );
            }
            return [
              {
                id: resolvedSessionId,
                title: text.trim().slice(0, 48),
                createdAt: now,
                lastMessageAt: now,
                messageCount: 1,
              },
              ...prev,
            ];
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const errorText =
          err instanceof Error ? err.message : 'An unknown error occurred.';

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: errorText }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, activeSessionId]
  );

  const startNewSession = useCallback(() => {
    abortRef.current?.abort();
    setActiveSessionId(undefined);
    setMessages([]);
    setIsLoading(false);
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    abortRef.current?.abort();
    setActiveSessionId(sessionId);
    setMessages([]);
    setIsLoading(false);
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    sessions,
    activeSessionId,
    isLoading,
    sendMessage,
    startNewSession,
    switchSession,
    cancelStream,
  };
}
