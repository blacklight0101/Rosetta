import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  checkReference,
  typedAnswers,
  type TypedQuestionId,
} from '../../domain/planning/typed-answers.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-605, RF-645, ADR-013, DEC-184: where the package states the owner's own typed answer instead of
// the default. The text is the owner's, so it is escaped as one line like any other typed text; a
// question with no typed answer writes nothing and the file is as it was. Where an own answer exists,
// the enumerated default (the style, the strategy) is named only as the reference Rosetta's checks
// use, after the owner's answer, never as the chosen style or strategy.

/** Whether the owner typed an own answer to the question that reached the planner. */
export function hasOwnAnswer(handoff: Pick<HandoffPackage, 'brief'>, id: TypedQuestionId): boolean {
  return typedAnswers(handoff.brief)[id] !== undefined;
}

/**
 * The default named as the reference of the checks. `title`, `record` and `detail` are already
 * escaped (or are Rosetta's own links); the sentence around them is Rosetta's.
 */
export function referenceLine(
  title: string,
  record: string,
  kind: 'style' | 'strategy',
  detail: string,
): string {
  return `${title}${record} is ${checkReference}, not the chosen ${kind}: ${detail}`;
}

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
