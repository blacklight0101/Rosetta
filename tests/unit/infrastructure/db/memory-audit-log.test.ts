import { describe, expect, it } from 'vitest';
import { MemoryAuditLog } from '../../../../src/infrastructure/db/memory-audit-log.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { auditLogContract } from '../../../contracts/audit-log.contract.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';

// Architecture section 7: the memory adapter passes the same contract as PgAuditLog.
describe('MemoryAuditLog', () => {
  auditLogContract('MemoryAuditLog', () => Promise.resolve(new MemoryAuditLog(new SecretMasker())));

  it('RF-1109 DEC-57 withholds the whole detail when the masking fails', async () => {
    const audit = new MemoryAuditLog(new FailingMasker());
    const at = new FixedClock('2026-10-11T09:00:00.000Z').now();
    const password = fixturePassword('Withheld');

    await audit.record({
      at,
      actorUserId: null,
      action: 'auth.sign_in',
      targetType: null,
      targetId: null,
      ip: '203.0.113.7',
      outcome: 'failed',
      detail: { password },
    });
    const listed = await audit.list({ since: at.getTime() });

    expect(JSON.stringify(listed)).not.toContain(password);
    expect(listed[0]?.detail).toEqual({ withheld: 'secret masking failed' });
  });
});
