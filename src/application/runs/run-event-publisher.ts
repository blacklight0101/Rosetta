import type { Clock } from '../ports/clock.js';
import type { RunEventHistory, RunEventSink, RunScope } from '../ports/run-events.js';
import type { RunEvent, RunEventType } from '../../domain/runs/run-event.js';

// RF-1006: the way a run puts events on its sink. It numbers them from 1 (or after the stored
// ones when a run is resumed, RF-006), stamps them with the injected clock and names the run by
// its folder name. The number is taken before the sink is awaited, so events emitted without
// waiting for each other keep the order of the calls.

export interface RunEventPublisherDependencies {
  readonly scope: RunScope;
  readonly sink: RunEventSink;
  readonly history: RunEventHistory;
  readonly clock: Clock;
}

export class RunEventPublisher {
  private readonly deps: RunEventPublisherDependencies;
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
  async emit(
    type: RunEventType,
    data: Readonly<Record<string, unknown>>,
    agentTaskId?: string,
  ): Promise<RunEvent> {
    const { scope, sink, clock } = this.deps;
    this.lastSeq += 1;
    const event: RunEvent = {
      schemaVersion: 1,
      seq: this.lastSeq,
      at: clock.now().toISOString(),
      runId: scope.runKey,
      type,
      ...(agentTaskId === undefined ? {} : { agentTaskId }),
      data,
    };
    await sink.publish(scope, event);
    return event;
  }
}
