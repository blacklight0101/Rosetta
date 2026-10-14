import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditLog } from '../../../../src/application/ports/audit-log.js';
import type { Clock } from '../../../../src/application/ports/clock.js';
import { SetCaps } from '../../../../src/application/use-cases/set-caps.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { MemoryServerCapsStore } from '../../../../src/infrastructure/db/memory-server-caps-store.js';
import { MemoryServerSettings } from '../../../../src/infrastructure/db/memory-server-settings.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryLogger } from '../../../support/memory-logger.js';

// RF-1106, RF-1109, DEC-107: the caps change and its audit row are one step. When the audit row
// cannot be written, the change does not happen either: the previous caps stay in force.

const admin: Actor = { userId: '00000000-0000-4000-8000-000000000001', role: 'admin' };
const clock: Clock = { now: () => new Date('2026-10-14T09:00:00Z') };
const defaults = { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n };

class FailingAuditLog implements AuditLog {
  record(): Promise<void> {
    return Promise.reject(new Error('The audit table is unavailable.'));
  }

  list(): Promise<readonly AuditEvent[]> {
    return Promise.resolve([]);
  }
}

describe('RF-1106 caps change and audit row', () => {
  it('RF-1106 a change whose audit row cannot be written keeps the previous caps', async () => {
    const settings = new MemoryServerSettings({});
    const setCaps = new SetCaps({
      settings,
      capsStore: new MemoryServerCapsStore(settings, new FailingAuditLog()),
      logger: new MemoryLogger(clock, new SecretMasker()),
      clock,
    });

    await expect(
      setCaps.execute({
        actor: admin,
        caps: { runMicros: 2_000_000n, userDayMicros: 3_000_000n, serverMonthMicros: 4_000_000n },
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow();

    expect(await settings.caps()).toEqual(defaults);
  });
});
