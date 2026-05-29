import { useEffect, useRef, type JSX } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

/** Props accepted by {@link ChatPage}. */
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

/**
 * Main chat layout: scrollable message log above the fixed chat input.
 *
 * **Responsive changes (SCRUM-5)**:
 * - Message list receives `overscroll-contain` to prevent pull-to-refresh
 *   gestures from bubbling up to the browser chrome on mobile (AC-7 / Error path 5).
 * - Height is controlled by the `h-dvh` root in `App.tsx`; this component
 *   takes up the remaining flex space via `flex-1`.
 */
export function ChatPage({
  messages,
  isLoading,
  onSend,
  onCancel,
}: ChatPageProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const displayed = messages.length === 0 ? [WELCOME] : messages;

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-gray-50">
      <div
        className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-6 space-y-4"
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
