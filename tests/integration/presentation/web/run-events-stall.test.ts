import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { connectSse, type SseConnection } from '../../../support/sse-client.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006, RNF-002: a page that stops reading while its stored events are replayed, over a real
// loopback connection. The history (about 6 MB) is more than the connection buffers take, so the
// replay waits for the page; the live events that arrive meanwhile are held for it until they pass
// 1 MiB, then the server closes the stream. The page reads what was already sent, sees the end and
// reconnects with the last id it read; it gets the rest, live events included.

const HISTORY = 3000;
const NOTE = 'x'.repeat(2000);
const LIVE_NOTE = 'y'.repeat(400_000);

let current: TestServer | undefined;
const connections: SseConnection[] = [];

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.abort();
  await current?.server.close();
  current = undefined;
});

/** The ids of the frames received whole. */
function idsOf(text: string): number[] {
  const whole = text.slice(0, text.lastIndexOf('\n\n') + 2);
  return [...whole.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
}

describe('GET /api/runs/:runId/events for a page that stalls during the replay', () => {
  it('RF-1006 closes the stream once the held live events pass 1 MiB; the reconnect replays the rest', async () => {
    const test = createTestServer();
    current = test;
    const user = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, user);
    const run = await test.runs.start(actorOf(user.account));
    const events = test.runs.executor.started[0]?.events;
    for (let turn = 1; turn <= HISTORY; turn += 1)
      await events?.emit('agent.turn', { turn, note: NOTE });
    const base = await test.server.listen({ host: '127.0.0.1', port: 0 });
    const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const url = `${base}/api/runs/${run.id}/events`;
    const stalled = await connectSse(url, { cookie });
    connections.push(stalled);
    await stalled.waitFor('id: 3\n');
    stalled.pause();

    for (let turn = 1; turn <= 3; turn += 1)
      await events?.emit('agent.note', { turn, note: LIVE_NOTE });
    await vi.waitFor(() => {
      expect(test.streams.size).toBe(0);
    });
    stalled.resume();
    await stalled.ended;

    const lastRead = idsOf(stalled.text()).at(-1) ?? 0;
    expect(lastRead).toBeLessThan(HISTORY);
    const again = await connectSse(url, { cookie, 'last-event-id': String(lastRead) });
    connections.push(again);
    await again.waitFor(`id: ${String(HISTORY + 4)}\n`);
    test.runs.executor.settle(run.id, { endState: 'Completed' });
    await again.ended;
    const total = HISTORY + 5;
    expect(idsOf(again.text())).toEqual(
      Array.from({ length: total - lastRead }, (_u, index) => index + lastRead + 1),
    );
    expect(test.runs.broadcaster.subscriberCount).toBe(0);
  }, 30_000);
});
