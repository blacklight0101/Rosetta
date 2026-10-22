// RF-406, Q-60: the timeout of one attempt. The attempt is cancelled when the caller's signal aborts
// or when `idleMs` pass without a `touch`. A call that is not streamed never touches, so its
// timeout is the whole call, as before; a stream touches at every new token, so only a stall ends
// it and a long answer that keeps coming does not.

export interface IdleSignal {
  /** Aborts with the caller's signal or when the attempt has been idle for too long. */
  readonly signal: AbortSignal;
  /** Something new arrived: the idle time starts again. */
  readonly touch: () => void;
  /** The attempt is over: no timer is left running. */
  readonly stop: () => void;
  /** True when the idle time, and not the caller, ended the attempt. */
  readonly timedOut: () => boolean;
}

export function idleSignal(caller: AbortSignal, idleMs: number): IdleSignal {
  const own = new AbortController();
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      idle = true;
      own.abort(new DOMException('The attempt was idle for too long.', 'TimeoutError'));
    }, idleMs);
  };
  arm();
  return {
    signal: AbortSignal.any([caller, own.signal]),
    touch: arm,
    stop: () => {
      clearTimeout(timer);
    },
    timedOut: () => idle && !caller.aborted,
  };
}
