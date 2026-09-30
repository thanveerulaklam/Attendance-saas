import { useEffect, useState } from 'react';

const DISMISS_MS = 3000;

/**
 * State for a banner that clears itself after a few seconds.
 * Empty values (null, '', false) stay put so a cleared banner does not restart the timer.
 */
export function useAutoDismiss(initialValue = null, delayMs = DISMISS_MS) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (value == null || value === '' || value === false) return undefined;
    const timer = window.setTimeout(() => setValue(initialValue), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, initialValue]);

  return [value, setValue];
}
