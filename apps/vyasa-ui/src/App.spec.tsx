/**
 * Unit tests for App.tsx mobile responsive behavior — SCRUM-5.
 *
 * Acceptance criteria covered:
 * AC-1: Sidebar hidden by default on mobile; hamburger button visible.
 * AC-2: Sidebar closes on backdrop click or session select.
 * AC-6: Desktop layout preserved — sidebar persistent, no backdrop.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    sessions: [
      {
        id: 'session-1',
        title: 'Test Session',
        createdAt: 0,
        lastMessageAt: 0,
        messageCount: 1,
      },
    ],
    activeSessionId: undefined,
    isLoading: false,
    sendMessage: vi.fn(),
    startNewSession: vi.fn(),
    switchSession: vi.fn(),
    cancelStream: vi.fn(),
  }),
}));

vi.mock('./components/SessionSidebar', () => ({
  /**
   * Minimal mock: exposes the session-sidebar testid and a session button
   * that calls onSelectSession + onClose (mirrors the real contract).
   */
  SessionSidebar: ({
    onSelectSession,
    onClose,
  }: {
    sessions: unknown[];
    activeSessionId?: string;
    onNewSession: () => void;
    onSelectSession: (id: string) => void;
    isMobile: boolean;
    onClose: () => void;
  }) => (
    <div aria-label="Sessions sidebar" data-testid="session-sidebar">
      <button
        data-testid="session-item"
        onClick={() => {
          onSelectSession('session-1');
          onClose?.();
        }}
      >
        Session 1
      </button>
    </div>
  ),
}));

vi.mock('./components/ChatPage', () => ({
  ChatPage: () => <div data-testid="chat-page">Chat Page</div>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configure window.matchMedia to return the given matches value. */
function setupMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — mobile responsive behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_hide_sidebar_by_default_when_mobile', () => {
    setupMatchMedia(false); // matchMedia('(min-width: 768px)') → false → mobile

    render(<App />);

    expect(screen.queryByTestId('session-sidebar')).not.toBeInTheDocument();
  });

  it('should_show_sidebar_by_default_when_desktop', () => {
    setupMatchMedia(true); // matchMedia returns true → desktop

    render(<App />);

    expect(screen.getByTestId('session-sidebar')).toBeInTheDocument();
  });

  it('should_open_sidebar_on_hamburger_click_when_mobile', () => {
    setupMatchMedia(false);

    render(<App />);

    // Sidebar must be hidden on initial mobile render
    expect(screen.queryByTestId('session-sidebar')).not.toBeInTheDocument();

    // Click the hamburger / open-sidebar button
    fireEvent.click(screen.getByRole('button', { name: /open sidebar/i }));

    // Sidebar appears + backdrop overlay rendered
    expect(screen.getByTestId('session-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();
  });

  it('should_close_sidebar_on_backdrop_click_when_mobile', () => {
    setupMatchMedia(false);

    render(<App />);

    // Open sidebar
    fireEvent.click(screen.getByRole('button', { name: /open sidebar/i }));
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();

    // Tap backdrop → close
    fireEvent.click(screen.getByTestId('sidebar-backdrop'));

    expect(screen.queryByTestId('session-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('should_close_sidebar_on_session_select_when_mobile', () => {
    setupMatchMedia(false);

    render(<App />);

    // Open sidebar
    fireEvent.click(screen.getByRole('button', { name: /open sidebar/i }));
    expect(screen.getByTestId('session-sidebar')).toBeInTheDocument();

    // Select a session (mock calls onSelectSession + onClose)
    fireEvent.click(screen.getByTestId('session-item'));

    expect(screen.queryByTestId('session-sidebar')).not.toBeInTheDocument();
  });

  it('should_not_render_backdrop_on_desktop', () => {
    setupMatchMedia(true);

    render(<App />);

    // Sidebar is shown persistently on desktop — no backdrop
    expect(screen.getByTestId('session-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });
});
