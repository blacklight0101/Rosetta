// RF-150: runs a task on an interval without keeping the process alive, one run at a time, and tells
// the caller when it failed; stopping it clears the timer.

export class IntervalTask {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  start(
    intervalMs: number,
    task: () => Promise<void>,
    onError: (error: unknown) => Promise<void>,
  ): void {
    this.stop();
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      task()
        .catch(onError)
        .catch(() => undefined)
        .finally(() => {
          this.running = false;
        });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
