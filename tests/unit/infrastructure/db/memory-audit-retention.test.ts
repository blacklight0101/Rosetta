import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryAuditLog } from '../../../../src/infrastructure/db/memory-audit-log.js';
import { MemoryAuditRetention } from '../../../../src/infrastructure/db/memory-audit-retention.js';
import { auditRetentionContract } from '../../../contracts/audit-retention.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';

// DEC-132: the memory adapter passes the same contract as PgAuditRetention.
auditRetentionContract('MemoryAuditRetention', () => {
  const clock = new FixedClock('2026-10-13T09:00:00.000Z');
  const audit = new MemoryAuditLog(new SecretMasker());
  return Promise.resolve({
    retention: new MemoryAuditRetention(audit, clock),
    audit,
    now: () => clock.now(),
  });
});
