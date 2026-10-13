import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { JsonlEventLog } from '../../../../src/infrastructure/events/jsonl-event-log.js';
import { runEventStoreContract } from '../../../contracts/run-event-store.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1006, RNF-002, RNF-003, data-model.md section 3.9: JsonlEventLog on a temporary data folder.
const data = useTempRoot('rosetta-events-');

function openLog(): JsonlEventLog {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir: data.path, logger });
  return new JsonlEventLog({ writer, masker });
}

const scope = scopeFor('20261012-100000-scan');

function eventsFile(): string {
  return join(
    data.path,
    'users',
    scope.userId,
    'projects',
    scope.projectId,
    'runs',
    scope.runKey,
    'events.jsonl',
  );
}

describe('JsonlEventLog', () => {
  runEventStoreContract('JsonlEventLog', () => {
    const log = openLog();
    return Promise.resolve({ sink: log, history: log });
  });

  it('RF-1006 appends one JSON line per event to events.jsonl in the run folder', async () => {
    const log = openLog();

    await log.publish(scope, eventFor(scope, 1, 'run.started', { stage: 'scan' }));
    await log.publish(scope, eventFor(scope, 2));

    const lines = (await readFile(eventsFile(), 'utf8')).split('\n');
    expect(lines.pop()).toBe('');
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      eventFor(scope, 1, 'run.started', { stage: 'scan' }),
      eventFor(scope, 2),
    ]);
  });

  it('RF-1006 a log opened later continues the run: it reads the stored events and the next sequence number', async () => {
    await openLog().publish(scope, eventFor(scope, 1));
    await openLog().publish(scope, eventFor(scope, 2));

    const reopened = openLog();

    expect(await reopened.lastSeq(scope)).toBe(2);
    await reopened.publish(scope, eventFor(scope, 3));
    expect((await reopened.read(scope, 0)).map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it('RNF-002 a torn last line from a crash is ignored when reading and repaired by the next event', async () => {
    await openLog().publish(scope, eventFor(scope, 1));
    await openLog().publish(scope, eventFor(scope, 2));
    await appendFile(eventsFile(), '{"schemaVersion":1,"seq":3,"at":"2026-10-12T10:0', 'utf8');
    const log = openLog();

    expect((await log.read(scope, 0)).map((event) => event.seq)).toEqual([1, 2]);
    expect(await log.lastSeq(scope)).toBe(2);
    await log.publish(scope, eventFor(scope, 3));

    const lines = (await readFile(eventsFile(), 'utf8')).trimEnd().split('\n');
    expect(lines.map((line) => (JSON.parse(line) as { seq: number }).seq)).toEqual([1, 2, 3]);
  });
});

describe('JsonlEventLog after a crash', () => {
  it('RNF-002 a run that ended before a crash still refuses events after run.ended', async () => {
    await openLog().publish(scope, eventFor(scope, 1, 'run.ended', { endState: 'Failed' }));

    await expect(openLog().publish(scope, eventFor(scope, 2))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
  });

  it('RNF-003 masks a secret in the data of an event before it is stored', async () => {
    const log = openLog();

    await log.publish(scope, eventFor(scope, 1, 'agent.tool.called', { note: fakeOpenAiKey }));

    const text = await readFile(eventsFile(), 'utf8');
    expect(text).not.toContain(fakeOpenAiKey);
    expect(text).toContain('[MASKED:');
  });

  it('RF-1006 a stored line that is complete but not an event is reported as RST-2104', async () => {
    await mkdir(join(eventsFile(), '..'), { recursive: true });
    await writeFile(eventsFile(), '{"not":"an event"}\n', 'utf8');

    await expect(openLog().read(scope, 0)).rejects.toMatchObject({
      code: ERROR_CODES.runEventLogFailed,
    });
  });

  it('RF-1006 an event type this version does not know is kept and read back', async () => {
    const log = openLog();

    await log.publish(scope, eventFor(scope, 1, 'future.event', { anything: true }));

    expect((await log.read(scope, 0)).map((event) => event.type)).toEqual(['future.event']);
  });
});

describe('JsonlEventLog reads by streaming', () => {
  it('RF-1006 replays a long log in several batches without reading the whole file as one text', async () => {
    const writer = new NodeOutputWriter({
      dataDir: data.path,
      logger: new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker()),
    });
    const log = new JsonlEventLog({ writer, masker: new SecretMasker() });
    // The 300 lines are written in one go: publishing each one appends and syncs a line of its own,
    // which took longer than the test timeout on a loaded machine. The replay is what is under test.
    const lines = Array.from(
      { length: 300 },
      (_, index) => `${JSON.stringify(eventFor(scope, index + 1))}\n`,
    );
    await mkdir(dirname(eventsFile()), { recursive: true });
    await writeFile(eventsFile(), lines.join(''), 'utf8');
    const readText = vi.spyOn(writer, 'readText');
    const batches: number[] = [];

    await log.replay(scope, 100, (batch) => {
      batches.push(batch.length);
      return Promise.resolve();
    });

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.reduce((sum, size) => sum + size, 0)).toBe(200);
    expect(readText).not.toHaveBeenCalled();
  });

  it('RNF-002 replay ignores a torn last line', async () => {
    await openLog().publish(scope, eventFor(scope, 1));
    await appendFile(eventsFile(), '{"schemaVersion":1,"seq":2,"at":"2026-10-1', 'utf8');
    const seen: number[] = [];

    await openLog().replay(scope, 0, (batch) => {
      seen.push(...batch.map((event) => event.seq));
      return Promise.resolve();
    });

    expect(seen).toEqual([1]);
  });
});
