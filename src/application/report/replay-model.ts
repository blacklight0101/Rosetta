// RF-506, data-model.md section 3.17: what the "Run replay" page shows, built from `events.jsonl`.
// Every `text` may hold repository or model text (a file name, a card title, a verdict's reason);
// the page writers render it as text only (RF-507).

/** The kinds of step, which the page styles; the words shown come from `label`. */
export type ReplayKind =
  | 'run'
  | 'source'
  | 'scan'
  | 'agent'
  | 'turn'
  | 'tool'
  | 'card'
  | 'verdict'
  | 'cost'
  | 'budget'
  | 'question';

export interface ReplayStep {
  readonly seq: number;
  /** The event's instant (ISO 8601 UTC). */
  readonly at: string;
  /** Milliseconds since the first event of the run. */
  readonly offsetMs: number;
  readonly kind: ReplayKind;
  /** Fixed words naming the step ("Tool call"). */
  readonly label: string;
  /** What the step says, from the event's data; untrusted. */
  readonly text: string;
  readonly agentTaskId?: string;
  /** Input and output tokens of the model answers up to and including this step. */
  readonly tokens: number;
  /** The run's cost in micro-dollars known at this step. */
  readonly costMicros: number;
}

export interface ReplayAgent {
  readonly agentTaskId: string;
  readonly area: string;
  readonly role: string;
  readonly model: string;
  /** `Planned` until the task ends; then the state of `agent.ended`. */
  readonly state: string;
  readonly turns: number;
  readonly cards: number;
}

export interface ReplayModel {
  readonly runKey: string;
  readonly steps: readonly ReplayStep[];
  readonly agents: readonly ReplayAgent[];
  readonly durationMs: number;
  readonly totalTokens: number;
  readonly totalCostMicros: number;
}
