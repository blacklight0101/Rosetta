import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRunEnded, type RunEvent } from '../../domain/runs/run-event.js';
import type { RunEventFeed, RunEventHistory } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1006, RF-1105: Subscribe run events gives a page the stored events after the one it last saw
// (`afterSeq`), then the live ones, with none twice and none missing, and ends the stream after
// `run.ended`. `execute` checks access and subscribes to the live feed; `replay` then reads the
// stored events in batches, waiting for the page to drain after each (so a history of any length
// can be sent), and holds back what arrives meanwhile, so an event published during the read is
// not lost. The caller starts `replay` once the page can receive. A `seq` beyond the last stored
// one (a page that names an event that never existed) counts as the last one. Another user's run
// id and an unknown id give the same answer, and nothing is subscribed. A page that stops reading
// during the replay is dropped once the live events held for it pass 1 MiB (the limit of live
// delivery): `onDrop` closes its stream, and it reconnects with `Last-Event-ID` for the rest.

/** The most bytes of live events (as JSON) held for one page while its replay runs. */
const MAX_HELD_BYTES = 1_048_576;

const encoder = new TextEncoder();

export interface SubscribeRunEventsDependencies {
  readonly runs: RunIndex;
  readonly history: RunEventHistory;
  readonly feed: RunEventFeed;
}

export interface SubscribeRunEventsRequest {
  readonly actor: Actor;
  readonly runId: string;
  /** The `seq` of the last event the page has; 0 for a page that has none. */
  readonly afterSeq: number;
  /** `stored` is true for an event read from the log, false for a live one. */
  readonly onEvent: (event: RunEvent, stored: boolean) => void;
  /** Resolves when the page can take more; awaited after each batch of stored events. */
  readonly drained?: () => Promise<void>;
  /** Called once, after `run.ended` was delivered. */
  readonly onEnd: () => void;
  /** Called once when the page is dropped for holding up more than `MAX_HELD_BYTES`. */
  readonly onDrop?: () => void;
}

export interface RunEventSubscription {
  /** Delivers the stored events after `afterSeq`, then the ones held back; ends a finished run. */
  replay(): Promise<void>;
  /** Stops delivering and frees the subscription (the page went away). */
  close(): void;
}

export class SubscribeRunEvents {
  private readonly deps: SubscribeRunEventsDependencies;

  constructor(deps: SubscribeRunEventsDependencies) {
    this.deps = deps;
  }

  // RF-1006, RF-1105
  async execute(
    request: SubscribeRunEventsRequest,
  ): Promise<Result<RunEventSubscription, 'not-found'>> {
    const { runs, history, feed } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const scope = scopeOf(run);
    const afterSeq = Math.min(request.afterSeq, await history.lastSeq(scope));
    const delivery = new Delivery(request, afterSeq);
    delivery.unsubscribe = feed.subscribe(run.userId, run.id, (event) => {
      delivery.live(event);
    });
    return ok({
      replay: async () => {
        try {
          await history.replay(scope, afterSeq, async (batch) => {
            for (const event of batch) delivery.send(event, true);
            await request.drained?.();
            if (delivery.isClosed) throw new ReplayStopped();
          });
          delivery.release();
          if (run.queueState === 'Ended') delivery.end();
        } catch (error) {
          delivery.close();
          if (!(error instanceof ReplayStopped)) throw error;
        }
      },
      close: () => {
        delivery.close();
      },
    });
  }
}

/** Thrown inside the replay to stop reading once the page is gone. */
class ReplayStopped extends Error {}

/** One page's delivery: in order, each `seq` once, held back until the stored events are sent. */
class Delivery {
  unsubscribe: () => void = () => undefined;
  private readonly request: SubscribeRunEventsRequest;
  private readonly held: RunEvent[] = [];
  private heldBytes = 0;
  private last: number;
  private holding = true;
  private closed = false;

  constructor(request: SubscribeRunEventsRequest, afterSeq: number) {
    this.request = request;
    this.last = afterSeq;
  }

  live(event: RunEvent): void {
    if (this.closed) return;
    if (!this.holding) {
      this.send(event);
      return;
    }
    this.held.push(event);
    this.heldBytes += encoder.encode(JSON.stringify(event)).byteLength;
    if (this.heldBytes <= MAX_HELD_BYTES) return;
    this.close();
    this.request.onDrop?.();
  }

  send(event: RunEvent, stored = false): void {
    if (this.closed || event.seq <= this.last) return;
    this.last = event.seq;
    this.request.onEvent(event, stored);
    if (isRunEnded(event)) this.end();
  }

  /** Sends what arrived while the stored events were read. */
  release(): void {
    this.holding = false;
    for (const event of this.held.splice(0)) this.send(event);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  end(): void {
    if (this.closed) return;
    this.close();
    this.request.onEnd();
  }

  close(): void {
    this.closed = true;
    this.held.length = 0;
    this.unsubscribe();
  }
}
