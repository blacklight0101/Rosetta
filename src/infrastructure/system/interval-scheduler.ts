import type { ScheduledJob, Scheduler } from '../../application/ports/scheduler.js';

// RF-1101, DEC-112: a job that is still running when its next tick arrives is skipped, and a
// failing job is reported to `onError` without stopping its schedule.
export class IntervalScheduler implements Scheduler {
  private readonly onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) {
    this.onError = onError;
  }

  every(intervalMs: number, job: ScheduledJob): () => void {
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      job()
        .catch(this.onError)
        .finally(() => {
          running = false;
        });
    }, intervalMs);
    timer.unref();
    return () => {
      clearInterval(timer);
    };
  }
}
