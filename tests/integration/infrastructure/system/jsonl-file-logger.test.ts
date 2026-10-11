import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { JsonlFileLogger } from '../../../../src/infrastructure/system/jsonl-file-logger.js';
import { loggerContract } from '../../../contracts/logger.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { useTempRoot } from '../../../support/temp-root.js';

const root = useTempRoot('rosetta-logs-');

function logsDir(): string {
  return join(root.path, 'logs');
}

loggerContract('JsonlFileLogger', (clock, masker) => {
  const logger = new JsonlFileLogger({ dataDir: root.path, clock, masker, retentionDays: 14 });
  const day = clock.now().toISOString().slice(0, 10);
  return Promise.resolve({
    logger,
    written: () => readFile(join(logsDir(), `rosetta-${day}.jsonl`), 'utf8'),
  });
});

function fileLogger(clock: FixedClock, retentionDays = 14): JsonlFileLogger {
  return new JsonlFileLogger({
    dataDir: root.path,
    clock,
    masker: new SecretMasker(),
    retentionDays,
  });
}

async function createLogFiles(names: readonly string[]): Promise<void> {
  await mkdir(logsDir(), { recursive: true });
  for (const name of names) {
    await writeFile(join(logsDir(), name), '{}\n', 'utf8');
  }
}

describe('JsonlFileLogger daily files', () => {
  it('RF-009 starts a new file named after the UTC day when the day changes', async () => {
    const clock = new FixedClock('2026-10-11T23:59:59.999Z');
    const logger = fileLogger(clock);

    await logger.log({ level: 'debug', logger: 'scan', message: 'late' });
    clock.advance(1);
    await logger.log({ level: 'info', logger: 'scan', message: 'early' });

    expect((await readdir(logsDir())).sort()).toEqual([
      'rosetta-2026-10-11.jsonl',
      'rosetta-2026-10-12.jsonl',
    ]);
    const firstDay = await readFile(join(logsDir(), 'rosetta-2026-10-11.jsonl'), 'utf8');
    expect(firstDay).toContain('"message":"late"');
    expect(firstDay).not.toContain('early');
  });

  it('RF-009 appends entries logged at the same time in the order they were logged', async () => {
    const logger = fileLogger(new FixedClock('2026-10-11T09:00:00.000Z'));

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((message) => logger.log({ level: 'info', logger: 'x', message })),
    );

    const text = await readFile(join(logsDir(), 'rosetta-2026-10-11.jsonl'), 'utf8');
    const entries = text
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line));
    for (const [index, message] of ['a', 'b', 'c', 'd'].entries()) {
      expect(entries[index]).toHaveProperty('message', message);
    }
    expect(entries).toHaveLength(4);
  });

  it('RF-009 reports a file it cannot write with its code', async () => {
    await writeFile(join(root.path, 'logs'), 'not a folder', 'utf8');
    const logger = fileLogger(new FixedClock('2026-10-11T09:00:00.000Z'));

    const failure = logger.log({ level: 'info', logger: 'x', message: 'lost' });

    await expect(failure).rejects.toHaveProperty('code', 'RST-2102');
    await expect(failure).rejects.toHaveProperty('cause.code', 'EEXIST');
  });
});

describe('JsonlFileLogger retention', () => {
  it('RF-009 deletes at start-up the files older than 14 days and keeps the rest', async () => {
    await createLogFiles([
      'rosetta-2026-09-20.jsonl',
      'rosetta-2026-09-26.jsonl',
      'rosetta-2026-09-27.jsonl',
      'rosetta-2026-10-11.jsonl',
      'rosetta-2026-13-01.jsonl',
      'notes.txt',
    ]);
    const logger = fileLogger(new FixedClock('2026-10-11T08:00:00.000Z'));

    const deleted = await logger.applyRetention();

    expect(deleted).toEqual(['rosetta-2026-09-20.jsonl', 'rosetta-2026-09-26.jsonl']);
    expect((await readdir(logsDir())).sort()).toEqual([
      'notes.txt',
      'rosetta-2026-09-27.jsonl',
      'rosetta-2026-10-11.jsonl',
      'rosetta-2026-13-01.jsonl',
    ]);
  });

  it('RF-009 applies the configured ROSETTA_LOG_RETENTION_DAYS', async () => {
    await createLogFiles(['rosetta-2026-10-09.jsonl', 'rosetta-2026-10-10.jsonl']);
    const logger = fileLogger(new FixedClock('2026-10-11T08:00:00.000Z'), 1);

    expect(await logger.applyRetention()).toEqual(['rosetta-2026-10-09.jsonl']);
    expect(await readdir(logsDir())).toEqual(['rosetta-2026-10-10.jsonl']);
  });

  it('RF-009 has nothing to delete before the first log file exists', async () => {
    const logger = fileLogger(new FixedClock('2026-10-11T08:00:00.000Z'));

    expect(await logger.applyRetention()).toEqual([]);
  });

  it('RF-009 reports a logs folder it cannot read with its code', async () => {
    await writeFile(join(root.path, 'logs'), 'not a folder', 'utf8');
    const logger = fileLogger(new FixedClock('2026-10-11T08:00:00.000Z'));

    await expect(logger.applyRetention()).rejects.toMatchObject({ code: 'RST-2102' });
  });
});
