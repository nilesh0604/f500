import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useChat } from './hooks/useChat';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatPage } from './components/ChatPage';

export default function App() {
  const {
    messages,
    sessions,
    activeSessionId,
    isLoading,
    sendMessage,
    startNewSession,
    switchSession,
    cancelStream,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      {sidebarOpen && (
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewSession={startNewSession}
          onSelectSession={switchSession}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 h-full">
        <header
          className="flex items-center gap-2 px-4 h-12 border-b
          border-gray-100 bg-white shrink-0 shadow-sm"
        >
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700
              hover:bg-gray-100 transition-colors"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md bg-gradient-to-br from-saffron-400
                to-maroon-500 flex items-center justify-center text-white
                font-bold text-xs"
            >
              V
            </div>
            <span className="text-sm font-semibold text-gray-800">
              Vyasa Intelligence
            </span>
            <span className="text-xs text-gray-400 font-normal hidden sm:block">
              — Mahabharata Q&amp;A
            </span>
          </div>

          {activeSessionId && (
            <span
              className="ml-auto text-[10px] text-gray-400 font-mono truncate
              max-w-[140px] hidden md:block"
            >
              {activeSessionId}
            </span>
          )}
        </header>

        <ChatPage
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onCancel={cancelStream}
        />
      </div>
    </div>
  );
}
