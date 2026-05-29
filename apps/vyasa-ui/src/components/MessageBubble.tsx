import { type JSX } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ChatMessage } from '../types';
import { AgentSteps } from './AgentSteps';

/** Props accepted by {@link MessageBubble}. */
interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * Renders a single chat message bubble.
 *
 * **Responsive changes (SCRUM-5)**:
 * - User bubble:      `max-w-[90%]` on mobile, `md:max-w-[75%]` on desktop.
 * - Assistant bubble: `max-w-[90%]` on mobile, `md:max-w-[85%]` on desktop.
 * - Prose content div gains `break-words overflow-hidden` to prevent long
 *   unbroken strings (URLs, code) from causing horizontal page scroll.
 */
export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div
          className="max-w-[90%] md:max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5
            bg-saffron-500 text-white text-sm leading-relaxed shadow-sm"
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-slide-up">
      <div className="flex gap-2.5 max-w-[90%] md:max-w-[85%]">
        <div
          className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br
            from-saffron-400 to-maroon-500 flex items-center justify-center
            text-white text-xs font-bold shadow-sm mt-0.5"
          aria-label="Vyasa AI"
        >
          V
        </div>

        <div className="flex-1 min-w-0">
          {message.agentSteps && message.agentSteps.length > 0 && (
            <AgentSteps
              steps={message.agentSteps}
              isStreaming={message.isStreaming}
            />
          )}

          {message.isStreaming && !message.content && (
            <div className="flex gap-1 items-center h-6 ml-1">
              <span className="w-2 h-2 bg-saffron-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-saffron-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-saffron-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          {message.content && (
            <div
              className="prose prose-sm max-w-none rounded-2xl rounded-tl-sm
                px-4 py-2.5 bg-white border border-gray-100 shadow-sm
                text-gray-800 leading-relaxed whitespace-pre-wrap
                break-words overflow-hidden"
            >
              {message.content}
              {message.isStreaming && (
                <span
                  className="inline-block w-0.5 h-4 bg-saffron-500 ml-0.5
                  animate-pulse align-middle"
                />
              )}
            </div>
          )}

          {message.error && (
            <div
              className="flex gap-2 items-start mt-1 p-3 rounded-xl
              bg-red-50 border border-red-200 text-red-700 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message.error}</span>
            </div>
          )}

          <time
            className="block mt-1 ml-1 text-[10px] text-gray-400"
            dateTime={new Date(message.timestamp).toISOString()}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
      </div>
    </div>
  );
}
