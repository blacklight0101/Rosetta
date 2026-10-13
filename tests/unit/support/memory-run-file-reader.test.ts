import { describe } from 'vitest';
import { runFileReaderContract } from '../../contracts/run-file-reader.contract.js';
import { MemoryRunFileReader } from '../../support/memory-run-file-reader.js';

describe('MemoryRunFileReader', () => {
  runFileReaderContract('MemoryRunFileReader', () => {
    const reader = new MemoryRunFileReader();
    return Promise.resolve({
      reader,
      seed: (scope, files) => {
        reader.seed(scope, files);
        return Promise.resolve();
      },
    });
  });
});
