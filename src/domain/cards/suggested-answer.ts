import type { Citation } from './citation.js';

// RF-645, DEC-178: one of the suggested answers an `OQ` card offers, the way Claude Code asks. Exactly
// one is recommended and listed first; it is the default that applies when the question is skipped.

/** The fewest suggested answers an `OQ` card written after DEC-178 carries. */
export const MIN_SUGGESTED_ANSWERS = 3;

export interface SuggestedAnswer {
  /** A short answer. */
  readonly answer: string;
  /** One sentence on what the answer means and what follows from it. */
  readonly description: string;
  readonly recommended: boolean;
  /** Empty when the code does not support the answer. */
  readonly citations: readonly Citation[];
}

/** EV-69: a question opened by one of these words asks for a person, a place, a thing or a reason. */
const openQuestionWord = /^(?:who|whom|whose|which|where|what|when|why|how)\b/iu;

/** True when the question is not a yes/no question, so "Yes" and "No" are not answers to it. */
export function isOpenQuestion(question: string): boolean {
  return openQuestionWord.test(question.trim());
}

/** True when the answer starts with "Yes" or "No". */
export function startsWithYesOrNo(answer: string): boolean {
  return /^(?:yes|no)\b/iu.test(answer.trim());
}

/** What the agent is told when an open question has a Yes or No answer. */
export const sameKindAnswerRefusal =
  'This question is not a yes/no question, so no suggested answer may start with "Yes" or "No". Give each answer, the third one too, the same kind as the question: a who, which, where or what question gets a person, a thing, a place or a reason, for example a qualified one such as "Mostly the warehouse team, with finance for refunds".';
