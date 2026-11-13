import type { PromptFile } from '../../agent/prompt-file.js';
import type { Rubric } from './rubric.js';

// RF-1404, RF-145: what the judge is sent.

export interface JudgeParts {
  readonly source: string;
  readonly answer: string;
  /** The hand label of the case; null when the case has none. */
  readonly label: string | null;
}

// RF-1404
export function judgeSystem(prompt: PromptFile, rubric: Rubric): string {
  throw new Error(`not implemented: ${prompt.name} ${rubric.family}`);
}

// RF-1404
export function judgeMessage(parts: JudgeParts, tag: () => string): string {
  throw new Error(`not implemented: ${String(parts.source.length)} ${tag()}`);
}
