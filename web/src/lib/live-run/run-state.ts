// RF-1002, RF-1003, RF-1004: what the live run page knows about a run, built from its events by
// `reduce-run.ts`. Nothing here is HTML: every text is shown as text.

export type AgentState =
  'Planned' | 'Running' | 'Done' | 'TurnLimitReached' | 'InvalidOutput' | 'Failed' | 'StoppedByCap';

export interface ToolNow {
  /** For example `read_file Catalog/Edit.aspx.cs:40-80`. */
  readonly text: string;
  readonly status: 'running' | 'ok' | 'failed';
}

interface CardRef {
  readonly cardId: string;
  readonly type: string;
  readonly title: string;
}

export interface AgentPanelState {
  readonly agentTaskId: string;
  readonly area: string;
  readonly role: string;
  readonly model: string;
  readonly state: AgentState;
  readonly turn: number;
  readonly filesRead: readonly string[];
  readonly tool: ToolNow | undefined;
  /** The file of the `read_file` call that has not answered yet. */
  readonly pendingRead: string | undefined;
  readonly cards: readonly CardRef[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Known only from `usage.recorded` events; undefined while none arrived. */
  readonly costMicros: number | undefined;
}

export type ClaimShown =
  'Proposed' | 'CitationsChecked' | 'CitationInvalid' | 'Supported' | 'Rejected' | 'Unverified';

export interface CitationRef {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface ClaimRow {
  readonly claimId: string;
  readonly cardId: string;
  readonly text: string | undefined;
  readonly citations: readonly CitationRef[];
  readonly status: ClaimShown;
  readonly reason: string | undefined;
}

export interface LogLine {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly text: string;
}

export interface SourceState {
  readonly owner: string;
  readonly repo: string;
  readonly subpath: string;
  readonly commitSha: string | undefined;
}

export interface CapsState {
  readonly maxCostMicros: number;
  readonly maxTokens: number;
}

interface ScanState {
  readonly files: number;
  readonly areas: number;
}

interface EndedState {
  readonly endState: string;
  readonly errorCode: string | undefined;
  readonly costMicros: number | undefined;
  /** RF-208: how many areas gave no usable card; undefined for a run that does not say. */
  readonly failedAreas: number | undefined;
}

interface RoleTokens {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface RunState {
  readonly lastSeq: number;
  /** The `at` of `run.started`; the event log shows times from it. */
  readonly startedAt: string | undefined;
  readonly stage: string | undefined;
  readonly source: SourceState | undefined;
  readonly caps: CapsState | undefined;
  /** The result of the scan, known from `scan.completed`; undefined for any other run. */
  readonly scan: ScanState | undefined;
  readonly agents: readonly AgentPanelState[];
  readonly cards: readonly CardRef[];
  readonly claims: readonly ClaimRow[];
  readonly log: readonly LogLine[];
  readonly roleCostMicros: Readonly<Record<string, number>>;
  /** The tokens of each role from its `usage.recorded` events (P1-96); empty for older runs. */
  readonly roleTokens: Readonly<Record<string, RoleTokens>>;
  readonly ended: EndedState | undefined;
}
