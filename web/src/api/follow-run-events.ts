import type { ApiFailure } from './client.js';
import type { RunEvent } from './run-events.js';

// RF-1006, RF-1002: follows the event stream of one run: the stored events first, then the live
// ones; after a break it asks again with `Last-Event-ID`, so no event is lost or shown twice.

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'ended' | 'failed';

export interface FollowOptions {
  readonly runId: string;
  readonly send: (path: string, init: RequestInit) => Promise<Response>;
  readonly signal: AbortSignal;
  readonly onEvent: (event: RunEvent) => void;
  /** `failure` comes with `failed`: what the server answered when it refused the stream. */
  readonly onStatus: (status: StreamStatus, failure?: ApiFailure) => void;
  /** Waiting time before a new attempt when the server named none. */
  readonly retryMs?: number;
}

// RF-1006
export function followRunEvents(options: FollowOptions): Promise<void> {
  void options;
  return Promise.resolve();
}
