// RF-612, RF-639, DEC-176 (Q-A): the build method on the page. Stub of the red commit: the types
// are final, the behaviour is written by the commit that follows.

export type ToolKind = 'claude-code' | 'codex' | 'other';

/** The tiers of the difficulty bands, smallest first, and the escalation model (RF-639). */
export const MODEL_SLOTS = ['smallest', 'middle', 'largest', 'escalation'] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

export interface MethodDraft {
  /** True when agents build; only meaningful once the question is answered. */
  readonly aiAssisted: boolean;
  /** The chosen agent tool; empty while the tool is unanswered. */
  readonly toolKind: ToolKind | '';
  /** The name of another tool, as typed. */
  readonly toolName: string;
  /** The model names as typed; empty text is a name not given. */
  readonly models: Readonly<Record<ModelSlot, string>>;
}

export const NO_MODELS: Readonly<Record<ModelSlot, string>> = {
  smallest: '',
  middle: '',
  largest: '',
  escalation: '',
};

export interface NamedTool {
  readonly kind: ToolKind;
  readonly name?: string;
}

export function agentToolNamedIn(texts: Readonly<Record<string, string>>): NamedTool | undefined {
  return Object.keys(texts).length > 1000 ? { kind: 'other' } : undefined;
}

export function methodLineOf(draft: MethodDraft): string {
  return draft.toolName.slice(1000);
}
