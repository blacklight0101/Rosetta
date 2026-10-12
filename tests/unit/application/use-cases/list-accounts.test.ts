import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { accountAdminHarness, client } from '../../../support/account-admin-harness.js';
import { FixedClock } from '../../../support/fixed-clock.js';

// RF-1102: the administration page lists every account with its last sign-in, number of
// projects and month-to-date cost (UTC calendar month, DEC-107). RF-1109: the audit view lists the
// last 30 days, filtered by user and action.

const dayMs = 86_400_000;

function at(iso: string): Date {
  return new FixedClock(iso).now();
}

describe('ListUsers', () => {
  it('RF-1102 lists every account with last sign-in, projects and month-to-date cost', async () => {
    const test = await accountAdminHarness();
    const signedInAt = at('2026-10-10T08:00:00.000Z').getTime();
    await test.users.update({ ...test.amy.account, lastSignInAt: signedInAt });
    test.usage.addProject(test.amy.account.id);
    test.usage.addCost({
      userId: test.amy.account.id,
      at: at('2026-10-01T00:00:00.000Z'),
      costMicros: 250_000n,
      currency: 'USD',
    });
    test.usage.addCost({
      userId: test.amy.account.id,
      at: at('2026-09-30T23:59:59.999Z'),
      costMicros: 999n,
      currency: 'USD',
    });

    const outcome = await test.listUsers.execute({ actor: test.admin.actor });

    expect(outcome).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          id: test.amy.account.id,
          userName: 'amy',
          state: 'Active',
          lastSignInAt: signedInAt,
          projects: 1,
          monthToDate: [{ currency: 'USD', costMicros: 250_000n }],
        }),
        expect.objectContaining({ userName: 'root', role: 'admin', projects: 0, monthToDate: [] }),
      ],
    });
  });

  it('RF-1100 shows a locked account as Locked', async () => {
    const test = await accountAdminHarness();
    const lockedUntil = test.clock.now().getTime() + 60_000;
    await test.users.update({ ...test.amy.account, lockedUntil });

    const outcome = await test.listUsers.execute({ actor: test.admin.actor });

    expect(outcome.ok && outcome.value[0]?.state).toBe('Locked');
  });

  it('RF-1102 refuses a user that is not an administrator', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.listUsers.execute({ actor: test.amy.actor });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
  });

  it('RF-1102 never answers a password hash', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.listUsers.execute({ actor: test.admin.actor });

    expect(JSON.stringify(outcome, (_key, value: unknown) => String(value))).not.toContain('fake$');
  });
});

describe('ListAudit', () => {
  async function withEvents() {
    const test = await accountAdminHarness();
    const atOffset = (offsetMs: number): Date => {
      const moved = new FixedClock('2026-10-11T09:00:00.000Z');
      moved.advance(offsetMs);
      return moved.now();
    };
    const record = (offsetMs: number, actorUserId: string, action: string) =>
      test.auditLog.record({
        at: atOffset(offsetMs),
        actorUserId,
        action,
        targetType: null,
        targetId: null,
        ip: client.ip,
        outcome: 'ok',
        detail: {},
      });
    await record(-31 * dayMs, test.amy.account.id, 'auth.sign_in');
    await record(-30 * dayMs, test.amy.account.id, 'auth.sign_in');
    await record(-1 * dayMs, test.amy.account.id, 'auth.sign_out');
    await record(-1000, test.admin.account.id, 'auth.sign_in');
    return test;
  }

  it('RF-1109 lists the last 30 days, newest first', async () => {
    const test = await withEvents();

    const outcome = await test.listAudit.execute({ actor: test.admin.actor });

    expect(outcome.ok && outcome.value.events.map((event) => event.action)).toEqual([
      'auth.sign_in',
      'auth.sign_out',
      'auth.sign_in',
    ]);
  });

  it('RF-1109 filters by user and by action', async () => {
    const test = await withEvents();

    const byUser = await test.listAudit.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
    });
    const byBoth = await test.listAudit.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      action: 'auth.sign_in',
    });

    expect(byUser.ok && byUser.value.events).toHaveLength(2);
    expect(byBoth.ok && byBoth.value.events).toHaveLength(1);
  });

  it('RF-1109 refuses a user that is not an administrator', async () => {
    const test = await withEvents();

    const outcome = await test.listAudit.execute({ actor: test.amy.actor });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
  });
});
