import { useState, useEffect } from 'react';

const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, _2xl: 1536 } as const;

interface MediaQueryResult {
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2xl: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function makeQuery(minWidth: number) {
  return window.matchMedia(`(min-width: ${minWidth}px)`);
}

export function useMediaQuery(): MediaQueryResult {
  const [matches, setMatches] = useState(() => ({
    sm: makeQuery(BREAKPOINTS.sm).matches,
    md: makeQuery(BREAKPOINTS.md).matches,
    lg: makeQuery(BREAKPOINTS.lg).matches,
    xl: makeQuery(BREAKPOINTS.xl).matches,
    _2xl: makeQuery(BREAKPOINTS._2xl).matches,
  }));

  useEffect(() => {
    const queries = Object.entries(BREAKPOINTS).map(([key, minWidth]) => {
      const mql = makeQuery(minWidth);
      const handler = (e: MediaQueryListEvent) => {
        setMatches(prev => ({ ...prev, [key]: e.matches }));
      };
      mql.addEventListener('change', handler);
      return { mql, handler };
    });

    return () => {
      queries.forEach(({ mql, handler }) => mql.removeEventListener('change', handler));
    };
  }, []);

  return {
    isSm: matches.sm,
    isMd: matches.md,
    isLg: matches.lg,
    isXl: matches.xl,
    is2xl: matches._2xl,
    isMobile: !matches.md,
    isTablet: matches.md && !matches.lg,
    isDesktop: matches.lg,
  };
}
