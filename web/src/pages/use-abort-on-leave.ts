import { useEffect, useRef } from 'preact/hooks';

/** A signal that fires when the form goes away (another tab, another page), so an upload stops. */
export function useAbortOnLeave(): AbortSignal {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = controller.current;
    return () => {
      current.abort();
    };
  }, []);
  return controller.current.signal;
}
