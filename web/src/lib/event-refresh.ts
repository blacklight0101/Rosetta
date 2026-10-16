/** RF-1004, P1-166: event-driven trailing refresh, at most once per second, with no idle polling. */
export function eventRefresh(read: () => void): { request: () => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const flush = (): void => {
    dirty = false;
    read();
    timer = setTimeout(() => {
      timer = undefined;
      if (dirty) flush();
    }, 1000);
  };
  flush();
  return {
    request: () => {
      if (timer === undefined) flush();
      else dirty = true;
    },
    dispose: () => {
      clearTimeout(timer);
    },
  };
}
