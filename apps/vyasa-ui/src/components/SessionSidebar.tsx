import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { Session } from '../types';

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId?: string;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
}: SessionSidebarProps) {
  const formatRelative = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <aside
      className="flex flex-col w-64 shrink-0 bg-gray-900 text-gray-100 h-full"
      aria-label="Sessions sidebar"
    >
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-700">
        <div
          className="w-7 h-7 rounded-lg bg-gradient-to-br from-saffron-400
            to-maroon-500 flex items-center justify-center text-white
            font-bold text-sm shadow"
        >
          V
        </div>
        <span className="font-semibold text-sm tracking-wide">
          Vyasa Intelligence
        </span>
      </div>

      <div className="px-3 py-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
            border border-dashed border-gray-600 text-gray-400
            hover:border-saffron-500 hover:text-saffron-400
            text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        {sessions.length === 0 ? (
          <p className="text-xs text-gray-500 text-center mt-6 px-2">
            Your conversations will appear here
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => onSelectSession(s.id)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5
                    rounded-lg text-left text-sm transition-colors group
                    ${
                      s.id === activeSessionId
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  aria-current={s.id === activeSessionId ? 'true' : undefined}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium leading-snug">
                      {s.title || 'Untitled'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatRelative(s.lastMessageAt)} · {s.messageCount} msg
                      {s.messageCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Trash2
                    className="w-3 h-3 opacity-0 group-hover:opacity-40
                      hover:!opacity-70 shrink-0 mt-0.5 transition-opacity"
                    aria-label="Delete session"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-700">
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Answers are drawn from the Mahabharata corpus via AWS Bedrock KB.
          Always verify with primary sources.
        </p>
      </div>
    </aside>
  );
}
