import { useState, useRef, KeyboardEvent, type JSX } from 'react';
import { Send, Square } from 'lucide-react';

/** Props accepted by {@link ChatInput}. */
interface ChatInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

/** Horizontally-scrollable quick-start suggestion chips. */
const SUGGESTIONS = [
  'Who was Karna and what was his fate?',
  'Explain the significance of the Bhagavad Gita in the Mahabharata.',
  'What role did Draupadi play in the Kurukshetra war?',
  'How did Bhishma earn his name and his vow?',
] as const;

/**
 * Auto-resizing chat input with quick-start suggestion chips.
 *
 * **Responsive changes (SCRUM-5)**:
 * - Chips render in a single horizontally-scrollable row (`overflow-x-auto`,
 *   each chip `shrink-0`) — no horizontal page-body scroll.
 * - Send and cancel buttons are `w-11 h-11` (44 × 44 px) to meet the WCAG
 *   2.5.5 minimum touch-target size.
 * - Outer wrapper has `pb-[env(safe-area-inset-bottom)]` for iPhone X home
 *   indicator safe area.
 */
export function ChatInput({
  onSend,
  onCancel,
  isLoading,
  disabled,
}: ChatInputProps): JSX.Element {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Send the current text if non-empty and not in loading state. */
  const handleSend = (): void => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  /** Send on Enter, allow Shift+Enter for newlines. */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Grow the textarea up to 160 px as content is added. */
  const handleInput = (): void => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="border-t border-gray-100 bg-white px-4 pt-3 pb-[env(safe-area-inset-bottom,0.75rem)]">
      {/* Suggestion chips — single scrollable row on mobile */}
      {!isLoading && text.trim() === '' && (
        <div className="flex overflow-x-auto gap-2 mb-3 scrollbar-hide">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => {
                setText(s);
                textareaRef.current?.focus();
              }}
              className="shrink-0 min-h-[44px] flex items-center text-xs px-3
                rounded-full border border-saffron-200 bg-saffron-50
                text-saffron-700 hover:bg-saffron-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the Mahabharata…"
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5
            text-sm text-gray-800 placeholder-gray-400 bg-gray-50
            focus:outline-none focus:ring-2 focus:ring-saffron-300 focus:border-transparent
            disabled:opacity-50 transition-all leading-relaxed overflow-hidden"
          style={{ minHeight: '44px', maxHeight: '160px' }}
          aria-label="Message input"
        />

        {/* Cancel / Send — both w-11 h-11 (44 × 44 px touch target) */}
        {isLoading ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-11 h-11 flex items-center justify-center
              rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            aria-label="Cancel stream"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="shrink-0 w-11 h-11 flex items-center justify-center
              rounded-xl bg-saffron-500 text-white hover:bg-saffron-600
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-gray-400">
        Press <kbd className="font-mono">Enter</kbd> to send ·{' '}
        <kbd className="font-mono">Shift+Enter</kbd> for newline
      </p>
    </div>
  );
}
