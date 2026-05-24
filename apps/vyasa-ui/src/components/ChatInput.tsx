import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const SUGGESTIONS = [
  'Who was Karna and what was his fate?',
  'Explain the significance of the Bhagavad Gita in the Mahabharata.',
  'What role did Draupadi play in the Kurukshetra war?',
  'How did Bhishma earn his name and his vow?',
];

export function ChatInput({
  onSend,
  onCancel,
  isLoading,
  disabled,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-3">
      {!isLoading && text.trim() === '' && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => {
                setText(s);
                textareaRef.current?.focus();
              }}
              className="text-xs px-3 py-1.5 rounded-full border border-saffron-200
                bg-saffron-50 text-saffron-700 hover:bg-saffron-100
                transition-colors truncate max-w-[240px]"
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

        {isLoading ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-10 h-10 flex items-center justify-center
              rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            aria-label="Cancel stream"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="shrink-0 w-10 h-10 flex items-center justify-center
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
