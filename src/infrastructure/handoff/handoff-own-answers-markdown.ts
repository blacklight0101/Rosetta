import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { typedAnswers, type TypedQuestionId } from '../../domain/planning/typed-answers.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-605, RF-645, ADR-013, DEC-184: where the package states the owner's own typed answer instead of
// the default. The text is the owner's, so it is escaped as one line like any other typed text; a
// question with no typed answer writes nothing and the file is as it was.

/** The owner's own answer to the question as one paragraph and a blank line; nothing when there is none. */
export function ownAnswerLines(
  handoff: Pick<HandoffPackage, 'brief'>,
  id: TypedQuestionId,
  esc: MarkdownEscaper,
): string[] {
  const text = typedAnswers(handoff.brief)[id];
  return text === undefined ? [] : [`The owner's own answer: ${esc.inline(text)}`, ''];
}

/** The owner's own principle as a list item (the lists of principles are bullets); nothing when none. */
export function ownPrincipleBullets(
  handoff: Pick<HandoffPackage, 'brief'>,
  esc: MarkdownEscaper,
): string[] {
  const text = typedAnswers(handoff.brief).principles;
  return text === undefined ? [] : [`- The owner's own principle: ${esc.inline(text)}`];
}
