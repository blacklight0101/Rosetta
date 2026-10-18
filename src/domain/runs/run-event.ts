// Data-model.md section 3.9 (`events.jsonl`), RF-1002..RF-1006: the events of a run. Every event
// has the envelope below; `seq` counts from 1 without gaps within a run, and `run.ended` is the
// last event. New types may be added without a version bump, so a stored event keeps its type as
// plain text and a reader ignores the types it does not know.

/** The canonical list of event types (data-model.md section 3.9). */
export type RunEventType =
  | 'run.started'
  | 'source.resolved'
  | 'source.downloaded'
  | 'scan.completed'
  | 'agent.planned'
  | 'agent.started'
  | 'agent.turn'
  | 'agent.tool.called'
  | 'agent.tool.result'
  | 'agent.card.proposed'
  | 'agent.ended'
  | 'verify.citation.checked'
  | 'verify.judgement.started'
  | 'verify.claim.judged'
  | 'verify.judgement.ended'
  | 'usage.recorded'
  | 'budget.warning'
  | 'budget.capReached'
  | 'cards.merged'
  | 'deepen.started'
  | 'deepen.round.started'
  | 'deepen.round.ended'
  | 'deepen.ended'
  | 'question.answered'
  | 'question.skipped'
  | 'run.ended';

/** The type of the last event of every run. */
const RUN_ENDED: RunEventType = 'run.ended';

export interface RunEvent {
  readonly schemaVersion: 1;
  /** 1, 2, 3 ... within the run, no gaps. */
  readonly seq: number;
  /** ISO 8601 UTC instant with milliseconds (data-model.md section 1). */
  readonly at: string;
  /** The run's folder name (`yyyyMMdd-HHmmss-<stage>`). */
  readonly runId: string;
  readonly type: string;
  /** When the event belongs to an agent task. */
  readonly agentTaskId?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

// RF-1006
export function isRunEnded(event: RunEvent): boolean {
  return event.type === RUN_ENDED;
}
