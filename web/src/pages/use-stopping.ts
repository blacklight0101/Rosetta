import { useRef, useState } from 'preact/hooks';
import type { ApiResult } from '../api/client.js';

// RF-159, DEC-188: a Cancel answers only when the work has ended, which can take up to the time limit of
// the attach. While its request waits the page says so and the button cannot be pressed twice.

export interface Stopping {
  /** A Cancel request is waiting for the server. */
  readonly stopping: boolean;
  /**
   * Sends the Cancel; `onStopped` runs when the server says the batch was stopped. A 409 or a request that
   * fails ends the waiting without it, and the Cancel button comes back.
   */
  readonly request: (call: () => Promise<ApiResult<unknown>>, onStopped: () => void) => void;
}

export function useStopping(): Stopping {
  const [stopping, setStopping] = useState(false);
  const waiting = useRef(false);
  const request = (call: () => Promise<ApiResult<unknown>>, onStopped: () => void): void => {
    if (waiting.current) return;
    waiting.current = true;
    setStopping(true);
    void call()
      .then((answer) => {
        if (answer.ok) onStopped();
      })
      .finally(() => {
        waiting.current = false;
        setStopping(false);
      });
  };
  return { stopping, request };
}

/** Stops the wait of a run: at once when there is no batch to ask, or when the server says it stopped it. */
export function stopRun(
  waiting: Stopping,
  stopping: AbortController,
  request: (() => Promise<ApiResult<unknown>>) | undefined,
): void {
  if (request === undefined) stopping.abort();
  else {
    waiting.request(request, () => {
      stopping.abort();
    });
  }
}
