// RF-1404: what the capture reads of a saved run: the agent tasks of its `transcripts/` folder.

export interface TranscriptMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

export interface TranscriptTask {
  /** The agent task, such as `planner-gap` or `reader-004`: the name of its transcript file. */
  readonly name: string;
  readonly messages: readonly TranscriptMessage[];
}

/** What the capture needs of a run besides its tasks. */
export interface CapturedRun {
  readonly key: string;
  /** The run id the manifest names. */
  readonly runId: string;
  readonly tasks: readonly TranscriptTask[];
  /** The reader's turn limit of the run, for the cases that need one. */
  readonly maxTurns: number;
}
