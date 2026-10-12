import { describe } from 'vitest';
import { MemorySessionStore } from '../../../../src/infrastructure/db/memory-session-store.js';
import { sessionStoreContract } from '../../../contracts/session-store.contract.js';
import { sequenceSessionIds } from '../../../support/session-fixtures.js';

// Architecture section 7: the memory adapter passes the same contract as PgSessionStore.
describe('MemorySessionStore', () => {
  sessionStoreContract('MemorySessionStore', () => {
    const store = new MemorySessionStore({ newId: sequenceSessionIds() });
    return Promise.resolve({
      store,
      userIds: ['00000000-0000-4000-9000-00000000a001', '00000000-0000-4000-9000-00000000a002'],
      storedHashes: () => Promise.resolve(store.storedKeys()),
    });
  });
});
