import { renderDataBlock } from '../../../domain/egress/data-block.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import type { Rubric } from './rubric.js';

// RF-1404, RF-145: what the judge is sent. The system prompt is the judge's prompt file and the
// rubric (both written by us). The inputs of the case, the model's answer and the hand label are
// untrusted text: they reach the judge only as three data blocks, each with a tag of its own.

export interface JudgeParts {
  readonly source: string;
  readonly answer: string;
  /** The hand label of the case; null when the case has none. */
  readonly label: string | null;
}

const NO_LABEL = 'There is no hand label for this case.';

// RF-1404
export function judgeSystem(prompt: PromptFile, rubric: Rubric): string {
  return `${prompt.text.trimEnd()}\n\n# Rubric: ${rubric.family}\n\n${rubric.text.trim()}\n`;
}

// RF-1404
export function judgeMessage(parts: JudgeParts, tag: () => string): string {
  const block = (source: 'lab_source' | 'lab_answer' | 'lab_label', text: string): string =>
    renderDataBlock({ source, excerpts: [], text }, tag());
  return [
    block('lab_source', parts.source),
    block('lab_answer', parts.answer),
    block('lab_label', parts.label ?? NO_LABEL),
  ].join('\n');
}
