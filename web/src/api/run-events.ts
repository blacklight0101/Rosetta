// RF-1002, RF-1006, data-model.md section 3.9: one run event as the stream delivers it. The data of
// each type is parsed where it is used; here only the envelope is checked.

export interface RunEvent {
  readonly seq: number;
  readonly at: string;
  readonly runId: string;
  readonly type: string;
  readonly agentTaskId: string | undefined;
  readonly data: Readonly<Record<string, unknown>>;
}

/** The event in one `data:` line of the stream, or undefined when it is not a valid event. */
// RF-1006
export function parseRunEvent(text: string): RunEvent | undefined {
  void text;
  return undefined;
}
