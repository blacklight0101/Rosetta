import { useState } from 'preact/hooks';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1002, design-system.md section 1 (principle 6): the view of the page that Pause updates can
// freeze. The stream keeps folding events into `live`; pausing keeps the state as it was and counts
// the events after it (their numbers follow one another, data-model.md section 3.9); resuming shows
// `live`, which has applied every held event in order.

export interface PauseView {
  /** What the panels show: the state at the moment of the pause, or the live one. */
  readonly shown: RunState;
  readonly paused: boolean;
  /** Events that arrived since the pause. */
  readonly waiting: number;
  /** What the page status says, once: `Updates paused`, `Updates resumed` or nothing. */
  readonly note: string | undefined;
  readonly toggle: () => void;
}

function noteOf(held: RunState | undefined, resumed: boolean): string | undefined {
  if (held !== undefined) return 'Updates paused';
  return resumed ? 'Updates resumed' : undefined;
}

// RF-1002
export function usePauseUpdates(live: RunState): PauseView {
  const [held, setHeld] = useState<RunState | undefined>();
  const [resumed, setResumed] = useState(false);
  const toggle = (): void => {
    setResumed(held !== undefined);
    setHeld(held === undefined ? live : undefined);
  };
  const waiting = held === undefined ? 0 : Math.max(0, live.lastSeq - held.lastSeq);
  return {
    shown: held ?? live,
    paused: held !== undefined,
    waiting,
    note: noteOf(held, resumed),
    toggle,
  };
}
