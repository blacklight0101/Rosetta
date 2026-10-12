import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { JsonlEventLog } from '../../../../src/infrastructure/events/jsonl-event-log.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import type { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006: a page that connects late reads the whole stored history, however long it is. The log
// here holds more than 1 MiB (520 events of about 2 KB), which is more than a page may leave
// unread; the replay must wait for the page to read instead of dropping it.

const data = useTempRoot('rosetta-sse-large-');
const EVENTS = 520;
const NOTE = 'x'.repeat(2000);

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Large {
  readonly amy: TestBrowser;
  readonly runId: string;
  readonly lastSeq: number;
}

async function largeRun(): Promise<Large> {
  const eventStore = (logger: MemoryLogger): JsonlEventLog =>
    new JsonlEventLog({
      writer: new NodeOutputWriter({ dataDir: data.path, logger }),
      masker: new SecretMasker(),
    });
  const test = createTestServer({ eventStore });
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const run = await test.runs.start(actorOf(user.account));
  const events = test.runs.executor.started[0]?.events;
  for (let turn = 1; turn <= EVENTS; turn += 1)
    await events?.emit('agent.turn', { turn, note: NOTE });
  test.runs.executor.settle(run.id, { endState: 'Completed' });
  await test.runs.ended(run);
  return { amy: await signedInBrowser(test.server, user), runId: run.id, lastSeq: EVENTS + 2 };
}

function seqsOf(body: string): number[] {
  return [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
}

describe('GET /api/runs/:runId/events with a history over 1 MiB', () => {
  it('RF-1006 replays every stored event of a run to a late page', async () => {
    const { amy, runId, lastSeq } = await largeRun();

    const response = await amy.request({ method: 'GET', url: `/api/runs/${runId}/events` });

    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBeGreaterThan(1_048_576);
    expect(seqsOf(response.body)).toEqual(
      Array.from({ length: lastSeq }, (_u, index) => index + 1),
    );
    expect(response.body).toContain('event: run.ended');
  }, 30_000);

  it('RF-1006 replays only what follows the Last-Event-ID of a page that reconnects mid-log', async () => {
    const { amy, runId, lastSeq } = await largeRun();

    const response = await amy.request({
      method: 'GET',
      url: `/api/runs/${runId}/events`,
      headers: { 'last-event-id': '260' },
    });

    expect(seqsOf(response.body)).toEqual(
      Array.from({ length: lastSeq - 260 }, (_u, index) => index + 261),
    );
    expect(response.body).toContain('event: run.ended');
  }, 30_000);
});
