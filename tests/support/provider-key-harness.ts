import type { Actor } from '../../src/domain/accounts/actor.js';
import { DeleteProviderKey } from '../../src/application/use-cases/delete-provider-key.js';
import { ListProviderKeys } from '../../src/application/use-cases/list-provider-keys.js';
import { SaveProviderKey } from '../../src/application/use-cases/save-provider-key.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { DnsPublicHostCheck } from '../../src/infrastructure/security/public-host-check.js';
import { FakeHostResolver } from './fake-host-resolver.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { fixtureSecret } from './provider-key-fixtures.js';

// RF-1104, RF-1109: the key use cases over memory adapters, the real AES-GCM box and the real
// address check behind a fake resolver (no network), for unit tests.

export interface ProviderKeyHarness {
  readonly clock: FixedClock;
  readonly logger: MemoryLogger;
  readonly audit: MemoryAuditLog;
  readonly keys: MemoryProviderKeyRepository;
  readonly box: AesGcmSecretBox;
  readonly resolver: FakeHostResolver;
  readonly save: SaveProviderKey;
  readonly remove: DeleteProviderKey;
  readonly list: ListProviderKeys;
  readonly amy: Actor;
  readonly bob: Actor;
}

export const keyClient = { ip: '203.0.113.9' } as const;

// RF-1104
export function providerKeyHarness(): ProviderKeyHarness {
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const audit = new MemoryAuditLog(masker);
  const keys = new MemoryProviderKeyRepository();
  const box = new AesGcmSecretBox({ current: fixtureSecret(1) });
  const resolver = new FakeHostResolver();
  const hostCheck = new DnsPublicHostCheck({ resolver: resolver.resolve });
  const base = { keys, auditLog: audit, logger, clock };
  return {
    ...{ clock, logger, audit, keys, box, resolver },
    save: new SaveProviderKey({ ...base, box, hostCheck }),
    remove: new DeleteProviderKey(base),
    list: new ListProviderKeys({ keys }),
    amy: { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' },
    bob: { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' },
  };
}
