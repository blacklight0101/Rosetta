import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { JsonlProviderCallLog } from '../../../../src/infrastructure/providers/jsonl-provider-call-log.js';
import { sampleRecord } from '../../../contracts/provider-call-recorder.contract.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-408, RF-006: the committed call-log files of tests/fixtures/call-log/ are read back by the
// same JsonlProviderCallLog code. Each test works on a copy, so a fixture is never changed.

const fixtureRoot = fileURLToPath(new URL('../../../fixtures/call-log/', import.meta.url));
const logFile = 'provider-calls.jsonl';

/** A run folder holding a copy of one fixture's call log. */
async function runFromFixture(root: string, name: string): Promise<string> {
  const runDir = join(root, name);
  await mkdir(runDir, { recursive: true });
  await copyFile(join(fixtureRoot, name, logFile), join(runDir, logFile));
  return runDir;
}

function seqsOf(text: string): unknown[] {
  return text
    .trimEnd()
    .split('\n')
    .map((line): unknown => {
      const parsed: unknown = JSON.parse(line);
      return parsed instanceof Object && 'seq' in parsed ? parsed.seq : undefined;
    });
}

/** The number of items under `password` in one call-log line, or undefined. */
function passwordItemCount(line: string): unknown {
  const parsed: unknown = JSON.parse(line);
  return parsed instanceof Object && 'password' in parsed && Array.isArray(parsed.password)
    ? parsed.password.length
    : undefined;
}

describe('JsonlProviderCallLog on the committed call-log fixtures (RF-408, RF-006)', () => {
  const tmp = useTempRoot('rosetta-call-fixtures-');
  const logFor = (runDir: string): JsonlProviderCallLog =>
    new JsonlProviderCallLog({ runDir, masker: new SecretMasker() });

  it('RF-408 continues seq after a call-log file with CRLF line ends', async () => {
    const runDir = await runFromFixture(tmp.path, 'crlf');
    const original = await readFile(join(fixtureRoot, 'crlf', logFile), 'utf8');

    await logFor(runDir).record(sampleRecord);

    const text = await readFile(join(runDir, logFile), 'utf8');
    expect(original).toContain('\r\n');
    expect(text.startsWith(original)).toBe(true);
    expect(text.slice(original.length).startsWith('{')).toBe(true);
    expect(seqsOf(text)).toEqual([1, 2, 3]);
  });

  it('RF-408 writes the first record as line 1 of an empty call-log file', async () => {
    const runDir = await runFromFixture(tmp.path, 'empty');

    await logFor(runDir).record(sampleRecord);

    const text = await readFile(join(runDir, logFile), 'utf8');
    expect(text.startsWith('{')).toBe(true);
    expect(text.split('\n')).toHaveLength(2);
    expect(seqsOf(text)).toEqual([1]);
  });

  it('RF-408 counts a call-log line that holds a very long array and continues seq after it', async () => {
    const runDir = await runFromFixture(tmp.path, 'long-array');
    const original = await readFile(join(fixtureRoot, 'long-array', logFile), 'utf8');

    await logFor(runDir).record({ ...sampleRecord, attempt: 2 });

    const text = await readFile(join(runDir, logFile), 'utf8');
    const [first, second] = text.split('\n');
    expect(text.startsWith(original)).toBe(true);
    expect(passwordItemCount(first ?? '')).toBe(5000);
    expect(second?.startsWith('{')).toBe(true);
    expect(seqsOf(text)).toEqual([1, 2]);
  });
});
