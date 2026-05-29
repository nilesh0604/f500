import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks whether a CSS media query currently matches.
 *
 * Subscribes to MediaQueryList `change` events so the value updates live when
 * the viewport crosses the breakpoint (e.g. device rotation).
 *
 * Guards against environments where `window.matchMedia` is unavailable
 * (jsdom / SSR) and returns `false` as a safe mobile-first default.
 *
 * @param query - A valid CSS media query string, e.g. `'(min-width: 768px)'`.
 * @returns `true` while the query matches the current viewport, `false` otherwise.
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 768px)');
 */
export function useMediaQuery(query: string): boolean {
  /** Lazy initialiser — reads current match state, safe for jsdom / SSR. */
  const [matches, setMatches] = useState<boolean>(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false; // safe default for jsdom / SSR
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mql = window.matchMedia(query);

    const onChange = (e: MediaQueryListEvent): void => {
      setMatches(e.matches);
    };

    mql.addEventListener('change', onChange);

    return (): void => {
      mql.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}
