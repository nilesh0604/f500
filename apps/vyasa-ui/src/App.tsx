import { useState, useEffect, useCallback, type JSX } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useChat } from './hooks/useChat';
import { useMediaQuery } from './hooks/useMediaQuery';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatPage } from './components/ChatPage';

/**
 * Root application component.
 *
 * Handles the responsive sidebar layout:
 * - Desktop (≥ 768 px): sidebar is persistent, always visible.
 * - Mobile  (< 768 px): sidebar is hidden by default; opens as a fixed
 *   slide-over drawer with a translucent backdrop overlay.
 *
 * The sidebar state is synchronised with the viewport via `useMediaQuery` so
 * that device rotation resets the layout to the appropriate default.
 */
export default function App(): JSX.Element {
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

  /** `true` when the viewport is ≥ 768 px (Tailwind `md` breakpoint). */
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isMobile = !isDesktop;

  /** Sidebar is open by default on desktop, closed by default on mobile. */
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(isDesktop);

  /**
   * Sync sidebar open-state when the viewport crosses the 768 px threshold
   * (e.g. device rotation).  Resets to the appropriate default for each mode.
   */
  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  /** Close the sidebar — used by the backdrop and SessionSidebar's onClose. */
  const closeSidebar = useCallback((): void => setSidebarOpen(false), []);

  /** Toggle the sidebar open/closed — used by the hamburger button. */
  const toggleSidebar = useCallback((): void => setSidebarOpen(o => !o), []);

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50 font-sans">
      {/* ── Mobile backdrop overlay ─────────────────────────────────────── */}
      {sidebarOpen && isMobile && (
        <div
          data-testid="sidebar-backdrop"
          className="fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
          onClick={closeSidebar}
        />
      )}

      {/* ── Session sidebar ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewSession={startNewSession}
          onSelectSession={switchSession}
          isMobile={isMobile}
          onClose={closeSidebar}
        />
      )}

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <header
          className="flex items-center gap-2 px-4 h-12 border-b
          border-gray-100 bg-white shrink-0 shadow-sm"
        >
          {/* Hamburger toggle — meets 44×44 px minimum touch target (w-11 h-11) */}
          <button
            onClick={toggleSidebar}
            className="w-11 h-11 flex items-center justify-center rounded-lg
              text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5" />
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
