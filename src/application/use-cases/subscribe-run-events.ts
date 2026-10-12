import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRunEnded, type RunEvent } from '../../domain/runs/run-event.js';
import type { RunEventFeed, RunEventHistory } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1006, RF-1105: Subscribe run events gives a page the stored events after the one it last saw
// (`afterSeq`), then the live ones, with none twice and none missing, and ends the stream after
// `run.ended`. It subscribes to the live feed before it reads the stored events and holds back
// what arrives meanwhile, so an event published during the read is not lost. Another user's run id
// and an unknown id give the same answer, and nothing is subscribed.

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
  readonly onEvent: (event: RunEvent) => void;
  /** Called once, after `run.ended` was delivered. */
  readonly onEnd: () => void;
}

export interface RunEventSubscription {
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
    const delivery = new Delivery(request);
    delivery.unsubscribe = feed.subscribe(run.userId, run.id, (event) => {
      delivery.live(event);
    });
    try {
      for (const event of await history.read(scopeOf(run), request.afterSeq)) delivery.send(event);
      delivery.release();
      if (run.queueState === 'Ended') delivery.end();
    } catch (error) {
      delivery.close();
      throw error;
    }
    return ok({
      close: () => {
        delivery.close();
      },
    });
  }
}

/** One page's delivery: in order, each `seq` once, held back until the stored events are sent. */
class Delivery {
  unsubscribe: () => void = () => undefined;
  private readonly request: SubscribeRunEventsRequest;
  private readonly held: RunEvent[] = [];
  private last: number;
  private holding = true;
  private closed = false;

  constructor(request: SubscribeRunEventsRequest) {
    this.request = request;
    this.last = request.afterSeq;
  }

  live(event: RunEvent): void {
    if (this.holding) this.held.push(event);
    else this.send(event);
  }

  send(event: RunEvent): void {
    if (this.closed || event.seq <= this.last) return;
    this.last = event.seq;
    this.request.onEvent(event);
    if (isRunEnded(event)) this.end();
  }

  /** Sends what arrived while the stored events were read. */
  release(): void {
    this.holding = false;
    for (const event of this.held.splice(0)) this.send(event);
  }

  end(): void {
    if (this.closed) return;
    this.close();
    this.request.onEnd();
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
  }
}
