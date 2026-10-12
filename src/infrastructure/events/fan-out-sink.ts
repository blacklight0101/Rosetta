import type { RunEventSink, RunScope } from '../../application/ports/run-events.js';
import type { RunEvent } from '../../domain/runs/run-event.js';

// Architecture section 7, RF-1006: one event to the stored log and to every connected page. The
// first sink is the log: when it refuses an event nothing else sees it, so a page never gets an
// event the log does not have. The other sinks are all tried; a failure among them is thrown after
// the rest were reached.
export class FanOutSink implements RunEventSink {
  private readonly log: RunEventSink;
  private readonly others: readonly RunEventSink[];

  constructor(sinks: readonly [RunEventSink, ...RunEventSink[]]) {
    const [log, ...others] = sinks;
    this.log = log;
    this.others = others;
  }

  async publish(scope: RunScope, event: RunEvent): Promise<void> {
    await this.log.publish(scope, event);
    const settled = await Promise.allSettled(this.others.map((sink) => sink.publish(scope, event)));
    for (const result of settled) {
      if (result.status === 'rejected') {
        throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      }
    }
  }
}
