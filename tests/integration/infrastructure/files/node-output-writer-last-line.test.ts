import { describe, expect, it } from 'vitest';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1006, RNF-002: the last complete line of a workspace file, read from its end, so the last
// event of a long log is found without reading the whole file. A torn last fragment (no line
// break) is not a line, as in `readLines`.

const temp = useTempRoot('rosetta-last-line-');
const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const file = { userId, path: 'projects/p/runs/r/events.jsonl' };

function newWriter(): NodeOutputWriter {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  return new NodeOutputWriter({ dataDir: temp.path, logger });
}

async function lastLineOf(content: string): Promise<string | undefined> {
  const writer = newWriter();
  const written = await writer.writeText(file, content);
  if (!written.ok) throw new Error(written.error.message);
  const read = await writer.readLastLine(file);
  if (!read.ok) throw new Error(read.error.message);
  return read.value;
}

describe('NodeOutputWriter.readLastLine', () => {
  it('RF-1006 gives the last complete line of the file', async () => {
    expect(await lastLineOf('one\ntwo\nthree\n')).toBe('three');
  });

  it('RNF-002 leaves out a torn last fragment without a line break', async () => {
    expect(await lastLineOf('one\ntwo\n{"seq":3,"at"')).toBe('two');
  });

  it('RF-1006 gives nothing for an empty file or one without a complete line', async () => {
    expect(await lastLineOf('')).toBeUndefined();
    expect(await lastLineOf('{"seq":1')).toBeUndefined();
  });

  it('RF-1006 reads a last line longer than one chunk, with characters of several bytes', async () => {
    const long = `${'é'.repeat(70_000)}€${'a'.repeat(70_001)}`;

    expect(await lastLineOf(`first\n${long}\n${'b'.repeat(90_000)}`)).toBe(long);
    expect(await lastLineOf(`${long}\n`)).toBe(long);
  });

  it('RF-1006 refuses a file that does not exist as not-found', async () => {
    const read = await newWriter().readLastLine({ userId, path: 'projects/p/runs/r/none.jsonl' });

    expect(read.ok ? undefined : read.error.reason).toBe('not-found');
  });
});
