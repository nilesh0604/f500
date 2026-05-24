import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

interface ChatPageProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

const WELCOME = {
  id: '__welcome__',
  role: 'assistant' as const,
  content:
    'Namaste! I am Vyasa, your guide to the Mahabharata. ' +
    'Ask me anything about the epic — its characters, events, ' +
    'philosophy, or the Bhagavad Gita.',
  timestamp: Date.now(),
};

export function ChatPage({
  messages,
  isLoading,
  onSend,
  onCancel,
}: ChatPageProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const displayed = messages.length === 0 ? [WELCOME] : messages;

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-gray-50">
      <div
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {displayed.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} onCancel={onCancel} isLoading={isLoading} />
    </div>
  );
}
