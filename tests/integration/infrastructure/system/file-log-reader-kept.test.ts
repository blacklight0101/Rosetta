import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SecretMasker,
  type MaskResult,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileApplicationLogReader } from '../../../../src/infrastructure/system/file-log-reader.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1011, RF-1105, RNF-003 (P5-28): the daily application log is parsed once for a run and kept;
// a grown file parses only its new lines. Parses are counted through the masker, which every
// parsed line passes through, so the tests do not depend on the speed of the machine.

const root = useTempRoot('rosetta-log-kept-');
const runKey = '20261011-090000-understand';
const runId = '00000000-0000-4000-b000-000000000001';
const day = '2026-10-11';
const span = {
  fromMs: Date.parse('2026-10-11T08:00:00.000Z'),
  toMs: Date.parse('2026-10-11T20:00:00.000Z'),
};

class CountingMasker implements TextMasker {
  count = 0;
  private readonly inner = new SecretMasker();
  mask(text: string): MaskResult {
    this.count += 1;
    return this.inner.mask(text);
  }
}

const lineOf = (n: number, mention = runKey): string =>
  JSON.stringify({
    at: `2026-10-11T10:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000Z`,
    level: 'info',
    logger: 'runs',
    message: `Entry ${String(n)}`,
    runId: mention,
  });

const fileOf = (): string => join(root.path, 'logs', `rosetta-${day}.jsonl`);

async function write(lines: readonly string[]): Promise<void> {
  await mkdir(join(root.path, 'logs'), { recursive: true });
  await writeFile(fileOf(), `${lines.join('\n')}\n`);
}

function readerOf() {
  const masker = new CountingMasker();
  return { masker, reader: new FileApplicationLogReader({ dataDir: root.path, masker }) };
}

describe('FileApplicationLogReader keeps what it parsed', () => {
  it('RF-1011 a 900-entry run log is parsed once, the second request parses nothing', async () => {
    await write(Array.from({ length: 900 }, (_item, n) => lineOf(n)));
    const { masker, reader } = readerOf();

    const first = await reader.read({ ...span, mentioning: [runId, runKey] });
    const parsed = masker.count;
    const second = await reader.read({ ...span, mentioning: [runId, runKey] });

    expect(first).toHaveLength(900);
    expect(parsed).toBeGreaterThan(0);
    expect(masker.count).toBe(parsed);
    expect(second).toEqual(first);
  });

  it('RF-1011 lines added to the file are the only ones parsed next', async () => {
    await write(Array.from({ length: 100 }, (_item, n) => lineOf(n)));
    const { masker, reader } = readerOf();
    await reader.read({ ...span, mentioning: [runKey] });
    const before = masker.count;
    await appendFile(fileOf(), `${lineOf(100)}\n${lineOf(101, 'other-run')}\n`);

    const again = await reader.read({ ...span, mentioning: [runKey] });

    expect(again).toHaveLength(101);
    expect(again.at(-1)?.message).toBe('Entry 100');
    expect(masker.count - before).toBeLessThan(before / 10);
  });
});

describe('FileApplicationLogReader keeps what it parsed: changes', () => {
  it('RF-1011 a torn last line is picked up once completed', async () => {
    await write([lineOf(1)]);
    await appendFile(fileOf(), lineOf(2).slice(0, 20));
    const { reader } = readerOf();
    expect(await reader.read({ ...span, mentioning: [runKey] })).toHaveLength(1);

    await appendFile(fileOf(), `${lineOf(2).slice(20)}\n`);

    expect(await reader.read({ ...span, mentioning: [runKey] })).toHaveLength(2);
  });

  it('RF-1011 a file that is gone gives no entries, and one that is rewritten is read again', async () => {
    await write([lineOf(1), lineOf(2)]);
    const { reader } = readerOf();
    expect(await reader.read({ ...span, mentioning: [runKey] })).toHaveLength(2);

    await write([lineOf(7)]);
    const rewritten = await reader.read({ ...span, mentioning: [runKey] });
    expect(rewritten.map((entry) => entry.message)).toEqual(['Entry 7']);

    await rm(fileOf());
    expect(await reader.read({ ...span, mentioning: [runKey] })).toEqual([]);
  });

  it('RF-1105 a run that does not mention another is never given its kept entries', async () => {
    await write([lineOf(1), lineOf(2, 'other-run')]);
    const { reader } = readerOf();
    await reader.read({ ...span, mentioning: [runKey] });

    const other = await reader.read({ ...span, mentioning: ['other-run'] });

    expect(other.map((entry) => entry.message)).toEqual(['Entry 2']);
  });
});
