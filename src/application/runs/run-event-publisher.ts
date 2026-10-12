import { KeyedQueue } from '../support/keyed-queue.js';
import type { Clock } from '../ports/clock.js';
import type { RunEventHistory, RunEventSink, RunScope } from '../ports/run-events.js';
import type { RunEvent, RunEventType } from '../../domain/runs/run-event.js';

// RF-1006: the way a run puts events on its sink. It numbers them from 1 (or after the stored
// ones when a run is resumed, RF-006), stamps them with the injected clock and names the run by
// its folder name. Emits go to the sink one after another in the order of the calls, and the
// number advances only once the sink has accepted the event, so one failed publish leaves the
// next emit with the number the failed one had.

export interface RunEventPublisherDependencies {
  readonly scope: RunScope;
  readonly sink: RunEventSink;
  readonly history: RunEventHistory;
  readonly clock: Clock;
}

export class RunEventPublisher {
  private readonly deps: RunEventPublisherDependencies;
  private readonly queue = new KeyedQueue();
  private lastSeq: number;

  private constructor(deps: RunEventPublisherDependencies, lastSeq: number) {
    this.deps = deps;
    this.lastSeq = lastSeq;
  }

  // RF-1006, RF-006
  static async open(deps: RunEventPublisherDependencies): Promise<RunEventPublisher> {
    return new RunEventPublisher(deps, await deps.history.lastSeq(deps.scope));
  }

  // RF-1006
  emit(
    type: RunEventType,
    data: Readonly<Record<string, unknown>>,
    agentTaskId?: string,
  ): Promise<RunEvent> {
    return this.queue.run('emit', () => this.publishNext(type, data, agentTaskId));
  }

  private async publishNext(
    type: RunEventType,
    data: Readonly<Record<string, unknown>>,
    agentTaskId: string | undefined,
  ): Promise<RunEvent> {
    const { scope, sink, clock } = this.deps;
    const event: RunEvent = {
      schemaVersion: 1,
      seq: this.lastSeq + 1,
      at: clock.now().toISOString(),
      runId: scope.runKey,
      type,
      ...(agentTaskId === undefined ? {} : { agentTaskId }),
      data,
    };
    await sink.publish(scope, event);
    this.lastSeq = event.seq;
    return event;
  }
}
