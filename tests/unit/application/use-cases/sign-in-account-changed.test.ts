import { describe, expect, it } from 'vitest';
import { SignIn } from '../../../../src/application/use-cases/sign-in.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixtureNow, minutes } from '../../../support/account-fixtures.js';
import { dummyHash, request, signInHarness } from '../../../support/sign-in-harness.js';

// RF-1100, RF-1102: when another server instance locks or disables the account between the read
// and the success write, the sign-in is refused, the account keeps what the other instance wrote
// and the audit row says `account-changed`.

describe('SignIn when the account changes under it', () => {
  it('RF-1102 a lock written after the read is kept and audited as account-changed', async () => {
    const { users, account, password, hasher, sessions, auditLog, logger, clock } =
      await signInHarness();
    const locked = {
      ...account,
      failedSignIns: 5,
      firstFailedAt: fixtureNow,
      lockedUntil: clock.now().getTime() + minutes(15),
    };
    const racing = {
      hash: (plain: string) => hasher.hash(plain),
      verify: async (plain: string, hash: string) => {
        await users.update(locked);
        return hasher.verify(plain, hash);
      },
    };
    const signIn = new SignIn({
      users,
      hasher: racing,
      sessions,
      auditLog,
      logger,
      clock,
      dummyHash,
    });

    const outcome = await signIn.execute({ userName: 'amy', password, ...request });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect(await users.findById(account.id)).toEqual(locked);
    const [audited] = await auditLog.list({ since: 0 });
    expect(audited).toMatchObject({ outcome: 'refused', detail: { reason: 'account-changed' } });
  });
});
