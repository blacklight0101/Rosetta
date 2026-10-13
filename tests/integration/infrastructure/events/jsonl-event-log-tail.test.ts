import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JsonlEventLog } from '../../../../src/infrastructure/events/jsonl-event-log.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1006, RNF-002: the last seq of a run whose log is not in memory (a finished run, or any run
// after a restart) is read from the end of events.jsonl; the whole log is neither read nor parsed.

const data = useTempRoot('rosetta-events-tail-');
const scope = scopeFor('20261012-100000-scan');

function openLog(): { log: JsonlEventLog; writer: NodeOutputWriter } {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir: data.path, logger });
  return { log: new JsonlEventLog({ writer, masker }), writer };
}

async function finishedRun(events: number): Promise<void> {
  const { log } = openLog();
  for (let seq = 1; seq < events; seq += 1) await log.publish(scope, eventFor(scope, seq));
  await log.publish(scope, eventFor(scope, events, 'run.ended', { endState: 'Completed' }));
}

function eventsFile(): string {
  const { userId, projectId, runKey } = scope;
  return join(data.path, 'users', userId, 'projects', projectId, 'runs', runKey, 'events.jsonl');
}

describe('JsonlEventLog.lastSeq of a log that is not in memory', () => {
  it('RF-1006 reads the last seq of a finished run from the end of the log, not the whole file', async () => {
    await finishedRun(50);
    const { log, writer } = openLog();
    const readText = vi.spyOn(writer, 'readText');
    const readLines = vi.spyOn(writer, 'readLines');

    expect(await log.lastSeq(scope)).toBe(50);
    expect(readText).not.toHaveBeenCalled();
    expect(readLines).not.toHaveBeenCalled();
  });

  it('RNF-002 ignores a torn last line and still reads only the end of the log', async () => {
    await finishedRun(3);
    await appendFile(eventsFile(), '{"schemaVersion":1,"seq":4,"at":"2026-10-12T10:0', 'utf8');
    const { log, writer } = openLog();
    const readText = vi.spyOn(writer, 'readText');

    expect(await log.lastSeq(scope)).toBe(3);
    expect(readText).not.toHaveBeenCalled();
  });

  it('RF-1006 gives 0 for a run without a log', async () => {
    expect(await openLog().log.lastSeq(scopeFor('20261012-100000-none'))).toBe(0);
  });
});
