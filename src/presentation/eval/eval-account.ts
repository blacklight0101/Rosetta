import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { UserAccount } from '../../domain/accounts/user.js';

// RNF-006, RF-305, ADR-007: the evaluation's own account, in memory only. Its daily cap stands in
// for the total cap of the command (the budget guard counts its calls against it), and it may use
// the server keys of the environment because the command has no keys of its own.

export function evaluationAccount(
  parts: { readonly clock: Clock; readonly ids: IdGenerator },
  dailyCapMicros: bigint,
): UserAccount {
  const now = parts.clock.now().getTime();
  return {
    ...{ id: parts.ids.uuid(), userName: 'evaluation', displayName: 'Evaluation' },
    ...{ role: 'user', state: 'Active', passwordHash: 'none', failedSignIns: 0 },
    ...{ firstFailedAt: null, lockedUntil: null, serverKeysAllowed: true },
    ...{ dailyCapMicros, ownDailyCapMicros: null },
    ...{ createdAt: now, updatedAt: now, lastSignInAt: null },
  };
}
