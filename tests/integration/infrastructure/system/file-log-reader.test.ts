import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FileApplicationLogReader } from '../../../../src/infrastructure/system/file-log-reader.js';
import { JsonlFileLogger } from '../../../../src/infrastructure/system/jsonl-file-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1011, RF-009, RNF-003: the "Logs" panel reads the daily files of the application log back: the
// days of the run, the lines that mention it, masked once more, and no line that does not parse.

const root = useTempRoot('rosetta-log-reader-');

const day1 = '2026-10-11T23:59:50.000Z';
const day2 = '2026-10-12T00:00:10.000Z';
const key = '20261011-235900-understand';

function loggerAt(clock: FixedClock): JsonlFileLogger {
  return new JsonlFileLogger({
    dataDir: root.path,
    clock,
    masker: new SecretMasker(),
    retentionDays: 14,
  });
}

function readerOf(): FileApplicationLogReader {
  return new FileApplicationLogReader({ dataDir: root.path, masker: new SecretMasker() });
}

const span = {
  fromMs: Date.parse('2026-10-11T23:59:00.000Z'),
  toMs: Date.parse('2026-10-12T00:05:00.000Z'),
};

describe('FileApplicationLogReader', () => {
  it('RF-1011 reads the entries of the days of the run in order and keeps only the lines that mention it', async () => {
    const clock = new FixedClock(day1);
    const logger = loggerAt(clock);
    await logger.log({ level: 'info', logger: 'runs', message: 'Started.', runId: key });
    await logger.log({ level: 'info', logger: 'runs', message: 'Other run.', runId: 'other-key' });
    clock.set(day2);
    await logger.log({
      level: 'warn',
      logger: 'agent',
      message: 'Slow.',
      runId: key,
      agentTaskId: 'reader-001',
      userId: 'user-amy',
    });

    const entries = await readerOf().read({ ...span, mentioning: [key] });

    expect(entries.map((entry) => [entry.at, entry.level, entry.logger, entry.message])).toEqual([
      [day1, 'info', 'runs', 'Started.'],
      [day2, 'warn', 'agent', 'Slow.'],
    ]);
    expect(entries[1]).toMatchObject({ runId: key, agentTaskId: 'reader-001', userId: 'user-amy' });
  });

  it('RF-1011 reads only the days between the two instants', async () => {
    const clock = new FixedClock(day1);
    const logger = loggerAt(clock);
    await logger.log({ level: 'info', logger: 'runs', message: 'Day one.', runId: key });
    clock.set(day2);
    await logger.log({ level: 'info', logger: 'runs', message: 'Day two.', runId: key });

    const entries = await readerOf().read({
      fromMs: Date.parse(day2),
      toMs: Date.parse(day2),
      mentioning: [key],
    });

    expect(entries.map((entry) => entry.message)).toEqual(['Day two.']);
  });

  it('RF-1011 gives no entries when there is no log folder yet', async () => {
    expect(await readerOf().read({ ...span, mentioning: [key] })).toEqual([]);
  });

  it('RF-1011 leaves out a line that is not an entry and a torn last line', async () => {
    const clock = new FixedClock(day1);
    await loggerAt(clock).log({ level: 'info', logger: 'runs', message: 'Good.', runId: key });
    const file = join(root.path, 'logs', 'rosetta-2026-10-11.jsonl');
    const second = JSON.stringify({
      schemaVersion: 1,
      at: day1,
      level: 'info',
      logger: 'x',
      message: 'Second.',
      runId: key,
    });
    const shout = `{"schemaVersion":1,"level":"shout","runId":"${key}"}`;
    const torn = `{"torn":"${key}`;
    await writeFile(file, `${second}\nnot json ${key}\n${shout}\n${torn}`, {
      encoding: 'utf8',
      flag: 'a',
    });

    const entries = await readerOf().read({ ...span, mentioning: [key] });

    expect(entries.map((entry) => entry.message)).toEqual(['Good.', 'Second.']);
  });

  it('RNF-003 masks a secret that is in a line when it is read', async () => {
    await mkdir(join(root.path, 'logs'), { recursive: true });
    const line = JSON.stringify({
      schemaVersion: 1,
      at: day1,
      level: 'error',
      logger: 'provider',
      message: `The key ${fakeOpenAiKey} was refused.`,
      runId: key,
    });
    await writeFile(join(root.path, 'logs', 'rosetta-2026-10-11.jsonl'), `${line}\n`, 'utf8');

    const entries = await readerOf().read({ ...span, mentioning: [key] });

    expect(JSON.stringify(entries)).not.toContain(fakeOpenAiKey);
    expect(entries[0]?.message).toContain('[MASKED:');
  });
});
