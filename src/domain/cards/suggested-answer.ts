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
const openQuestionWord =
  /^(?:(?:in|on|at|by|for|to|with|from|of|under|during|after|before)\s+)?(?:who|whom|whose|which|where|what|when|why|how)\b/iu;

/** True when the question is not a yes/no question, so "Yes" and "No" are not answers to it. */
export function isOpenQuestion(question: string): boolean {
  return openQuestionWord.test(question.trim());
}

/** True when the answer starts with "Yes" or "No". */
export function startsWithYesOrNo(answer: string): boolean {
  // P8-08: "No one" answers a Who question; it is not a No.
  return /^(?:yes|no(?!\s+one\b))\b/iu.test(answer.trim());
}

/** What the agent is told when an open question has a Yes or No answer. */
export const sameKindAnswerRefusal =
  'This question is not a yes/no question, so no suggested answer may start with "Yes" or "No". Give each answer, the third one too, the same kind as the question: a who, which, where or what question gets a person, a thing, a place or a reason, for example a qualified one such as "Mostly the warehouse team, with finance for refunds".';

/** Characters a model puts between words that show as nothing: zero-width spaces and joiners. */
const invisible = /[\u200b-\u200d\u2060\ufeff]/gu;

/**
 * P8-08, EV-89: the words of a suggested answer or its description are joined with one space. A
 * line break, a tab or an invisible character between two words is a space, never nothing, so
 * "A fixed" and "business rule" never read "A fixedbusiness rule".
 */
export function spacedWords(text: string): string {
  return text.replace(invisible, ' ').replace(/\s+/gu, ' ').trim();
}

/** A question opened by a verb asks yes or no, unless it joins two sides with "or". */
const closedQuestionStart =
  /^(?:is|are|was|were|do|does|did|can|could|should|will|would|must|may|has|have)\b/iu;

/** "or both", "or neither" and "or not" are not a second side; "and/or" joins nothing. */
const notASide = /\bor\s+(?:both|neither|not|either)\b|\band\/or\b/iu;

/** "by A or by B": the same preposition opens both sides, so the question asks which one. */
const sameSidePreposition =
  /\b(by|for|in|on|at|to|from|with|of|under|via|through)\b[^?]*?\bor\s+\1\b/iu;

/**
 * P9-13, EV-89: true when a verb-opened question clearly offers two sides ("Is it run by this team or
 * by another system?"), so "Yes" and "No" do not answer it. Conservative: only the same preposition
 * on both sides counts. "or" between two verbs or single words ("cancel or return", "Spain or
 * Portugal"), "or both", "or not" and "and/or" are never sides.
 */
export function isEitherOrQuestion(question: string): boolean {
  const text = question.trim();
  if (isOpenQuestion(text) || !closedQuestionStart.test(text) || notASide.test(text)) return false;
  return sameSidePreposition.test(text);
}

/**
 * P9-13: the answers of an either-or question without its "Yes" and "No" answers, so a heuristic
 * never costs the card. The list is returned as written when the question is not an either-or
 * question, when the recommended answer is one of those dropped (it would need a new one), or when
 * fewer than `MIN_SUGGESTED_ANSWERS` would stay.
 */
export function withoutYesNoOfEitherOr<T extends { answer: string; recommended: boolean }>(
  question: string | undefined,
  answers: readonly T[],
): readonly T[] {
  if (question === undefined || !isEitherOrQuestion(question)) return answers;
  const kept = answers.filter((each) => !startsWithYesOrNo(each.answer));
  const recommendedStays = kept.some((each) => each.recommended);
  return recommendedStays && kept.length >= MIN_SUGGESTED_ANSWERS ? kept : answers;
}
