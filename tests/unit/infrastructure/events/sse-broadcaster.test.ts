import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import { SseBroadcaster } from '../../../../src/infrastructure/events/sse-broadcaster.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-1006, RF-1105: the broadcaster delivers a run's live events to the pages of its owner only,
// masked, and forgets a run's listeners when the run ends.

const scope = scopeFor('20261012-100000-scan');
const otherUser = '00000000-0000-4000-9000-0000000000b2';

function collect(): { readonly events: RunEvent[]; readonly listener: (event: RunEvent) => void } {
  const events: RunEvent[] = [];
  return { events, listener: (event) => events.push(event) };
}

describe('SseBroadcaster', () => {
  it('RF-1006 delivers each published event to every page of the owner watching the run', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const first = collect();
    const second = collect();
    broadcaster.subscribe(scope.userId, scope.id, first.listener);
    broadcaster.subscribe(scope.userId, scope.id, second.listener);

    await broadcaster.publish(scope, eventFor(scope, 1));

    expect(first.events).toEqual([eventFor(scope, 1)]);
    expect(second.events).toEqual([eventFor(scope, 1)]);
  });

  it('RF-1105 never delivers to another user, nor for another run', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const stranger = collect();
    const elsewhere = collect();
    broadcaster.subscribe(otherUser, scope.id, stranger.listener);
    broadcaster.subscribe(scope.userId, scopeFor('20261012-100001-scan').id, elsewhere.listener);

    await broadcaster.publish(scope, eventFor(scope, 1));

    expect(stranger.events).toEqual([]);
    expect(elsewhere.events).toEqual([]);
  });

  it('RF-1006 stops delivering to a page that unsubscribed, and frees it', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const page = collect();
    const unsubscribe = broadcaster.subscribe(scope.userId, scope.id, page.listener);
    expect(broadcaster.subscriberCount).toBe(1);

    unsubscribe();
    unsubscribe();
    await broadcaster.publish(scope, eventFor(scope, 1));

    expect(page.events).toEqual([]);
    expect(broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 forgets the listeners of a run after run.ended', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const page = collect();
    broadcaster.subscribe(scope.userId, scope.id, page.listener);

    await broadcaster.publish(scope, eventFor(scope, 1, 'run.ended', { endState: 'Completed' }));

    expect(page.events.map((event) => event.type)).toEqual(['run.ended']);
    expect(broadcaster.subscriberCount).toBe(0);
  });

  it('RNF-003 masks a secret in an event before any page sees it', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const page = collect();
    broadcaster.subscribe(scope.userId, scope.id, page.listener);

    await broadcaster.publish(scope, eventFor(scope, 1, 'agent.turn', { note: fakeOpenAiKey }));

    expect(JSON.stringify(page.events)).not.toContain(fakeOpenAiKey);
  });

  it('RF-1006 a listener that throws does not stop the others or the publisher', async () => {
    const broadcaster = new SseBroadcaster(new SecretMasker());
    const page = collect();
    broadcaster.subscribe(scope.userId, scope.id, () => {
      throw new Error('closed');
    });
    broadcaster.subscribe(scope.userId, scope.id, page.listener);

    await expect(broadcaster.publish(scope, eventFor(scope, 1))).resolves.toBeUndefined();

    expect(page.events).toHaveLength(1);
    expect(broadcaster.subscriberCount).toBe(1);
  });

  it('RNF-003 delivers nothing when masking fails', async () => {
    const failing = { mask: vi.fn(() => { throw new Error('masker failed'); }) };
    const broadcaster = new SseBroadcaster(failing);
    const page = collect();
    broadcaster.subscribe(scope.userId, scope.id, page.listener);

    await expect(broadcaster.publish(scope, eventFor(scope, 1))).rejects.toThrow();

    expect(page.events).toEqual([]);
  });
});
