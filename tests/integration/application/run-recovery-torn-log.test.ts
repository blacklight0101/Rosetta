import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  RunEventHistory,
  RunEventSink,
  RunScope,
} from '../../../src/application/ports/run-events.js';
import type { RunEvent } from '../../../src/domain/runs/run-event.js';
import { JsonlEventLog } from '../../../src/infrastructure/events/jsonl-event-log.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { createRunHarness, userAmy, type RunHarness } from '../../support/run-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-006, RNF-002, P8-122, P8-131: restart recovery over the real file log. A crash that tears the
// last line of `events.jsonl` still gives the running time up to the last whole event; a log that
// cannot be read keeps the fallback (the open span counts as 0).

const data = useTempRoot('rosetta-recovery-torn-');

/** The file log of a process; `restart` opens a new one, as a new process has no tail in memory. */
class RestartableLog implements RunEventSink, RunEventHistory {
  private current: JsonlEventLog;
  private readonly open: () => JsonlEventLog;

  constructor(open: () => JsonlEventLog) {
    this.open = open;
    this.current = open();
  }

  restart(): void {
    this.current = this.open();
  }

  publish(scope: RunScope, event: RunEvent): Promise<void> {
    return this.current.publish(scope, event);
  }

  read(scope: RunScope, afterSeq: number): Promise<readonly RunEvent[]> {
    return this.current.read(scope, afterSeq);
  }

  replay(
    scope: RunScope,
    afterSeq: number,
    onBatch: (batch: readonly RunEvent[]) => Promise<void>,
  ): Promise<void> {
    return this.current.replay(scope, afterSeq, onBatch);
  }

  lastSeq(scope: RunScope): Promise<number> {
    return this.current.lastSeq(scope);
  }
}

function harnessOverFileLog(): { h: RunHarness; log: RestartableLog } {
  const masker = new SecretMasker();
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const logger = new MemoryLogger(clock, masker);
  const writer = new NodeOutputWriter({ dataDir: data.path, logger });
  const log = new RestartableLog(() => new JsonlEventLog({ writer, masker }));
  return { h: createRunHarness({ clock, logger, eventStore: log }), log };
}

function eventsFileOf(h: RunHarness, run: Parameters<RunHarness['scopeOf']>[0]): string {
  const { userId, projectId, runKey } = h.scopeOf(run);
  return join(data.path, 'users', userId, 'projects', projectId, 'runs', runKey, 'events.jsonl');
}

describe('restart recovery over a file log that the crash left damaged', () => {
  it('P8-131 counts the running time up to the last whole event when the last line is torn', async () => {
    const { h, log } = harnessOverFileLog();
    const run = await h.start(userAmy);
    h.clock.advance(20_000);
    await h.executor.started[0]?.events.emit('agent.started', {});
    h.clock.advance(5_000);
    await appendFile(
      eventsFileOf(h, run),
      '{"schemaVersion":1,"seq":3,"at":"2026-10-12T10:0',
      'utf8',
    );
    h.clock.advance(3_600_000);
    log.restart();

    await h.restart().recover();

    const ended = await h.runs.find(userAmy.userId, run.id);
    expect(ended).toMatchObject({
      endState: 'Interrupted',
      endReason: 'Restart',
      activeMs: 20_000,
    });
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.map((event) => event.type)).toEqual([
      'run.started',
      'agent.started',
      'run.ended',
    ]);
  });

  it('P8-131 counts the open span as 0 and logs it when the last whole line is not an event', async () => {
    const { h, log } = harnessOverFileLog();
    const run = await h.start(userAmy);
    h.clock.advance(20_000);
    await h.executor.started[0]?.events.emit('agent.started', {});
    await appendFile(eventsFileOf(h, run), 'not an event\n', 'utf8');
    h.clock.advance(3_600_000);
    log.restart();

    await h.restart().recover();

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      endReason: 'Restart',
      activeMs: 0,
    });
    expect(h.logger.text()).toContain('Could not record the last event');
  });
});
