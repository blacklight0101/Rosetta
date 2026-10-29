import type { SuggestedOption } from '../../application/ports/answers-file.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-637, RF-645, DEC-178: the suggested answers under an open question of open-questions.md. The
// recommended answer comes first and is marked; the team may answer otherwise. The text comes from a
// model, so every part goes through the escaper as inline text (ADR-013). A question with no suggested
// answers (an older run) gets no lines.

const intro =
  'Suggested answers, the recommended one first; the team may answer otherwise or type its own:';
// DEC-184: a question with no recommended option (the build method) says so instead.
const introNone =
  'Suggested answers, none recommended; the team may answer otherwise or type its own:';

/** The recommended answer first, the others in the order given. */
function recommendedFirst(options: readonly SuggestedOption[]): readonly SuggestedOption[] {
  return [
    ...options.filter((option) => option.recommended),
    ...options.filter((option) => !option.recommended),
  ];
}

/** The lines under one question's bullet; empty when the question has no suggested answers. */
export function suggestedAnswerLines(
  options: readonly SuggestedOption[] | undefined,
  esc: MarkdownEscaper,
): string[] {
  if (options === undefined || options.length === 0) return [];
  return [
    `  ${options.some((option) => option.recommended) ? intro : introNone}`,
    '',
    ...recommendedFirst(options).map(
      (option, index) =>
        `  ${String(index + 1)}. ${esc.inline(option.answer)}${option.recommended ? ' (Recommended)' : ''} - ${esc.inline(option.description)}`,
    ),
  ];
}
