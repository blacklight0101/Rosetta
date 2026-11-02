import type { SuggestedOption } from '../../application/ports/answers-file.js';
import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { suggestedAnswerLines } from './handoff-suggested-answers-markdown.js';

// RF-637, RF-645, DEC-184, DEC-189, P6-31: two additions to the suggested answers of
// open-questions.md. When the "Default:" line of an analysis question and its recommended answer
// differ, one sentence says so (the plan used the default, not the recommended answer). A brief
// question that took its default lists the Plan setup options. The sentence is Rosetta's own and
// holds no model text; the options go through the escaper like any suggested answer (ADR-013).

const differs =
  'The recommended answer differs from the default the package used; the package was written with the default shown above, so answer the question to change it.';

const normal = (text: string): string =>
  text
    .trim()
    .replace(/[.\s]+$/u, '')
    .toLowerCase();

/** The sentence under a question whose recommended answer is not its default; empty otherwise. */
export function defaultDiffersLines(
  options: readonly SuggestedOption[] | undefined,
  defaultText: string,
): string[] {
  const recommended = options?.find((option) => option.recommended);
  if (recommended === undefined || normal(recommended.answer) === normal(defaultText)) return [];
  return [`  ${differs}`, ''];
}

/** The Plan setup options under the questions of the brief that took their default; empty when none. */
export function briefOptionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { briefOptions } = handoff;
  if (briefOptions === undefined) return [];
  return handoff.briefQuestions.flatMap((question) => {
    const lines = suggestedAnswerLines(
      briefOptions[question.id],
      esc,
      question.id === 'principles',
    );
    return lines.length === 0
      ? []
      : [`- ${esc.inline(question.question)} (${esc.inline(question.id)})`, ...lines, ''];
  });
}
