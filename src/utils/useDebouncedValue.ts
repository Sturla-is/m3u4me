import { useEffect, useState } from 'react';

/**
 * Returns `value`, but only updated after it hasn't changed for `delayMs` — the standard
 * debounce pattern for search-as-you-type, so an expensive fetch/computation only runs
 * once the user pauses instead of on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
