/**
 * Unit tests for useMediaQuery hook — SCRUM-5 responsive mobile layout.
 *
 * Acceptance criteria covered:
 * AC-1/AC-6: sidebarOpen driven by real-time media query result.
 * Error path: matchMedia unavailable (jsdom / SSR) → safe default false.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

/** Helper: install a window.matchMedia mock with a given initial matches value */
function mockMatchMedia(matches: boolean) {
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
  return mql;
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_return_true_when_query_matches', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('should_return_false_when_query_does_not_match', () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('should_update_when_media_query_change_fires', () => {
    let changeHandler: ((e: { matches: boolean }) => void) | null = null;

    const mql = {
      matches: false,
      addEventListener: vi.fn(
        (event: string, cb: (e: { matches: boolean }) => void) => {
          if (event === 'change') changeHandler = cb;
        }
      ),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mql),
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);

    act(() => {
      changeHandler?.({ matches: true });
    });

    expect(result.current).toBe(true);
  });

  it('should_return_false_when_matchMedia_is_unavailable', () => {
    // Simulate jsdom / SSR environments where matchMedia does not exist
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });
});
