import type { UsageCap } from '../../domain/budget/usage-cap.js';

/** P5-20: the run caps among a role's caps, for the readers' room check. */
export function runCapsOf(caps: readonly UsageCap[]): {
  readonly tokens: bigint;
  readonly micros: bigint;
  readonly approved?: boolean;
} {
  const limit = (kind: UsageCap['kind']): bigint =>
    caps.find((cap) => cap.kind === kind)?.limit ?? 0n;
  // The run pauses only where the approved amount binds: a run cost cap of the administrator is a stop.
  const isApproved = (kind: UsageCap['kind']): boolean =>
    caps.find((cap) => cap.kind === kind)?.source === 'approved';
  const approved =
    isApproved('run-tokens') &&
    (!caps.some((c) => c.kind === 'run-cost') || isApproved('run-cost'));
  return {
    tokens: limit('run-tokens'),
    micros: limit('run-cost'),
    ...(approved ? { approved } : {}),
  };
}
