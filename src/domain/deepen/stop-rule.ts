// RF-209, DEC-145 (Q-H): when a Deepen ends. A round that adds no new `Supported` claim and reads
// no new first-party file ends it ("no progress"); so does the round limit (default 3, allowed 1 to
// 5), a cap (`CapReached`, resumable with RF-006), the owner's Stop and the readers' room check
// (`readersStopped`, RF-429, P5-30: no reader task started so the claims written could be judged).

export const DEEPEN_ROUNDS = { min: 1, max: 5, default: 3 } as const;

export const DEEPEN_STOP_REASONS = [
  'noProgress',
  'roundLimit',
  'capReached',
  'stopped',
  'readersStopped',
] as const;
export type DeepenStopReason = (typeof DEEPEN_STOP_REASONS)[number];

/** What a round added. */
export interface RoundProgress {
  /** Claims `Supported` after the round that were not before it. */
  readonly newSupported: number;
  /** First-party files read after the round that were not before it. */
  readonly newFilesRead: number;
}

/** What is known before and after a round: the `Supported` claims and the first-party files read. */
export interface RoundSnapshot {
  readonly supported: ReadonlySet<string>;
  readonly filesRead: ReadonlySet<string>;
}

function added(before: ReadonlySet<string>, after: ReadonlySet<string>): number {
  return [...after].filter((each) => !before.has(each)).length;
}

// RF-209
export function roundProgress(before: RoundSnapshot, after: RoundSnapshot): RoundProgress {
  return {
    newSupported: added(before.supported, after.supported),
    newFilesRead: added(before.filesRead, after.filesRead),
  };
}

/** Why the Deepen ends after a round that ran to its end, or undefined when another round follows. */
// RF-209
export function stopAfterRound(
  progress: RoundProgress,
  roundsDone: number,
  maxRounds: number,
): DeepenStopReason | undefined {
  if (progress.newSupported === 0 && progress.newFilesRead === 0) return 'noProgress';
  return roundsDone >= maxRounds ? 'roundLimit' : undefined;
}

/** Whether a requested round limit is allowed (1 to 5). */
export function isAllowedRoundLimit(rounds: number): boolean {
  return Number.isInteger(rounds) && rounds >= DEEPEN_ROUNDS.min && rounds <= DEEPEN_ROUNDS.max;
}
