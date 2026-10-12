import { describe } from 'vitest';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { mirrorContract } from '../../contracts/repository-reader-mirror.contract.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import type { NewReader } from '../../support/reader-harness.js';

// P1-90: the in-memory reader passes the same mirror contract as NodeRepositoryReader (whose
// integration test runs it as part of the full RepositoryReader contract).

const newReader: NewReader = (fixture) =>
  Promise.resolve({
    reader: new MemoryRepositoryReader(fixture.files),
    logger: new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker()),
  });

describe('MemoryRepositoryReader mirrors NodeRepositoryReader', () => {
  mirrorContract(newReader);
});
