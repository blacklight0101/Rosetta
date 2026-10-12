import type { Actor } from '../../domain/accounts/actor.js';
import type { UserAccount } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1102, RF-1105: the account an administrator changes. Only an administrator may change another
// account; an administrator changes their own password through ChangePassword and never disables
// themselves (RST-2213), so the server cannot lose its last way in by a slip of the hand. An
// unknown id is "not found".

export type AdministeredProblem =
  | typeof ERROR_CODES.notAllowed
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.ownAccountRefused;

// RF-1102
export async function administeredAccount(
  users: UserRepository,
  actor: Actor,
  userId: string,
): Promise<Result<UserAccount, AdministeredProblem>> {
  if (actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
  if (userId === actor.userId) return err(ERROR_CODES.ownAccountRefused);
  const account = await users.findById(userId);
  return account === undefined ? err(ERROR_CODES.notFound) : ok(account);
}
