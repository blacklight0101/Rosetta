// RF-1101, DEC-112: periodic jobs inside the process (one instance assumed).
export type ScheduledJob = () => Promise<void>;

export interface Scheduler {
  /** Runs `job` every `intervalMs`; the returned function cancels it. */
  every(intervalMs: number, job: ScheduledJob): () => void;
}
