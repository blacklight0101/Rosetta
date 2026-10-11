import type { ScheduledJob, Scheduler } from '../../src/application/ports/scheduler.js';

interface Registration {
  readonly intervalMs: number;
  readonly job: ScheduledJob;
}

/** A scheduler that runs its jobs only when a test calls `tick`. */
export class ManualScheduler implements Scheduler {
  private readonly registrations = new Set<Registration>();
  private readonly onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) {
    this.onError = onError;
  }

  get activeJobs(): number {
    return this.registrations.size;
  }

  get intervals(): readonly number[] {
    return [...this.registrations].map((registration) => registration.intervalMs);
  }

  every(intervalMs: number, job: ScheduledJob): () => void {
    const registration = { intervalMs, job };
    this.registrations.add(registration);
    return () => {
      this.registrations.delete(registration);
    };
  }

  /** Runs every active job once, in registration order; a failing job goes to onError. */
  async tick(): Promise<void> {
    for (const registration of [...this.registrations]) {
      try {
        await registration.job();
      } catch (error) {
        this.onError(error);
      }
    }
  }
}
