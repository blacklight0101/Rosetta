import { describe } from 'vitest';
import { archiveWriterContract } from '../../contracts/archive-writer.contract.js';
import { MemoryArchiveWriter } from '../../support/memory-archive-writer.js';

describe('MemoryArchiveWriter', () => {
  archiveWriterContract('MemoryArchiveWriter', () => {
    const writer = new MemoryArchiveWriter();
    return Promise.resolve({
      writer,
      seed: (scope, files) => {
        writer.seed(scope, files);
        return Promise.resolve();
      },
    });
  });
});
