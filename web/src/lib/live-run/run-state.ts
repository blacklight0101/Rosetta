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

/** A public GitHub repository pinned to a commit; an absent `kind` means GitHub. */
export interface GithubSourceState {
  readonly kind?: 'github' | undefined;
  readonly owner: string;
  readonly repo: string;
  readonly subpath: string;
  readonly commitSha: string | undefined;
}

/** RF-131: a zip the user uploaded; it has no repository or commit. */
export interface UploadSourceState {
  readonly kind: 'upload';
  readonly fileName: string | undefined;
  /** RF-156: a project of Excel workbooks (shown like an upload): the file names; undefined for a zip. */
  readonly workbooks?: readonly string[] | undefined;
  readonly uploadedAt: string | undefined;
  readonly snapshotHash: string | undefined;
  /** The run the report belongs to; the events do not carry it, the page sets it. */
  readonly runId: string | undefined;
  /** The report, whose card pages the citations open, exists; the page sets it. */
  readonly reportBuilt: boolean;
}

export type SourceState = GithubSourceState | UploadSourceState;

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

/** RF-209: the cards a Deepen starts from, as counts. */
interface DeepenSeeded {
  readonly cards: number;
  readonly claims: number;
  readonly supported: number;
  readonly rejected: number;
  /** Claims whose citation failed the check; an older event leaves them out, the rest is counted here. */
  readonly citationInvalid: number;
  readonly notJudged: number;
}

/** RF-209: one round of a Deepen; `cut` is a round a cap or a Stop ended before its end. */
export interface DeepenRoundState {
  readonly round: number;
  readonly status: 'running' | 'done' | 'cut';
  readonly judge: number;
  readonly reread: number;
  readonly outOfScope: number;
  readonly unreadFiles: number;
  /** What the round added; zero until it ends. */
  readonly newClaims: number;
  readonly newSupported: number;
  readonly filesRead: number;
}

/** RF-209: where a Deepen run stands, from its `deepen.*` events. */
export interface DeepenProgress {
  readonly parentRunId: string;
  /** The folder name of the completed run it improves. */
  readonly parentRunKey: string;
  readonly maxRounds: number;
  readonly coveragePass: boolean;
  readonly seeded: DeepenSeeded;
  readonly rounds: readonly DeepenRoundState[];
  /** Why it stopped; undefined while it goes on, and again once a resume starts it. */
  readonly stop: { readonly reason: string; readonly roundsDone: number } | undefined;
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
  /**
   * RF-1014: the judgement step from `verify.judgement.started` and `verify.judgement.ended`;
   * `idle` before it starts and for runs that never judge.
   */
  readonly judgement: 'idle' | 'running' | 'ended';
  readonly log: readonly LogLine[];
  readonly roleCostMicros: Readonly<Record<string, number>>;
  /** The tokens of each role from its `usage.recorded` events (P1-96); empty for older runs. */
  readonly roleTokens: Readonly<Record<string, RoleTokens>>;
  /** RF-209: set only for a Deepen run. */
  readonly deepen: DeepenProgress | undefined;
  readonly ended: EndedState | undefined;
}
