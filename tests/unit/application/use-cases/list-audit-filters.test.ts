import { describe, expect, it } from 'vitest';
import type { AuditEventInput } from '../../../../src/application/ports/audit-log.js';
import { accountAdminHarness, client } from '../../../support/account-admin-harness.js';
import { FixedClock } from '../../../support/fixed-clock.js';

// RF-1109, P1-107: the audit view narrows the last 30 days to the last 24 hours or 7 days, and to
// one outcome. The harness clock stands at 2026-10-11T09:00:00.000Z.

const hourMs = 3_600_000;

async function withEvents() {
  const test = await accountAdminHarness();
  const record = (offsetMs: number, action: string, outcome: AuditEventInput['outcome']) => {
    const moved = new FixedClock('2026-10-11T09:00:00.000Z');
    moved.advance(offsetMs);
    return test.auditLog.record({
      at: moved.now(),
      actorUserId: test.amy.account.id,
      action,
      targetType: null,
      targetId: null,
      ip: client.ip,
      outcome,
      detail: {},
    });
  };
  await record(-20 * 24 * hourMs, 'user.created', 'ok');
  await record(-3 * 24 * hourMs, 'auth.sign_in', 'failed');
  await record(-2 * hourMs, 'request.refused', 'refused');
  await record(-1 * hourMs, 'auth.sign_in', 'ok');
  return test;
}

describe('ListAudit period and outcome', () => {
  it.each([
    [1, ['auth.sign_in', 'request.refused']],
    [7, ['auth.sign_in', 'request.refused', 'auth.sign_in']],
    [30, ['auth.sign_in', 'request.refused', 'auth.sign_in', 'user.created']],
  ] as const)('RF-1109 the last %i days list only their events', async (days, actions) => {
    const test = await withEvents();

    const outcome = await test.listAudit.execute({ actor: test.admin.actor, days });

    expect(outcome.ok && outcome.value.events.map((event) => event.action)).toEqual(actions);
    expect(outcome.ok && outcome.value.since).toBe(
      new FixedClock('2026-10-11T09:00:00.000Z').now().getTime() - days * 24 * hourMs,
    );
  });

  it('RF-1109 lists only the events of one outcome', async () => {
    const test = await withEvents();

    const refused = await test.listAudit.execute({ actor: test.admin.actor, outcome: 'refused' });
    const failed = await test.listAudit.execute({ actor: test.admin.actor, outcome: 'failed' });

    expect(refused.ok && refused.value.events.map((event) => event.action)).toEqual([
      'request.refused',
    ]);
    expect(failed.ok && failed.value.events.map((event) => event.action)).toEqual(['auth.sign_in']);
  });
});

describe('ListUsers server keys', () => {
  it('RF-1104 lists whether each account may use the server keys', async () => {
    const test = await accountAdminHarness();
    await test.users.update({ ...test.amy.account, serverKeysAllowed: false });

    const outcome = await test.listUsers.execute({ actor: test.admin.actor });

    expect(outcome.ok && outcome.value.map((account) => account.serverKeysAllowed)).toEqual([
      false,
      true,
    ]);
  });
});
