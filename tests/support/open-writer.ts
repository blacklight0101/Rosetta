import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';

/** A real output writer on a temporary data folder, with a logger that keeps its entries. */
export function openWriter(dataDir: string): NodeOutputWriter {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  return new NodeOutputWriter({ dataDir, logger: new MemoryLogger(clock, new SecretMasker()) });
}
