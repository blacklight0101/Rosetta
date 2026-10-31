import type { UserRepository } from '../../src/application/ports/user-repository.js';
import type { RoleKeyDependencies } from '../../src/application/runs/role-keys.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { keySourceLookupOf } from '../../src/infrastructure/providers/key-source-lookup.js';

// RF-431: the key check of the test server. The server holds a key for each cloud provider, so a
// run is refused only when the account may not use it and holds no key of its own.

export function testRoleKeys(
  users: UserRepository,
  keys: MemoryProviderKeyRepository,
): RoleKeyDependencies {
  const serverKeys = { openai: 'sk-test-server', anthropic: 'sk-test-server' };
  return { users, keys: keySourceLookupOf({ keys, serverKeys }) };
}
