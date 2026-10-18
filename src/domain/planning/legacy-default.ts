import type { DefaultedQuestion } from './brief-questions.js';

// RF-631, DEC-80, DEC-135: an open question takes a default (DEC-80), and the default keeps the
// legacy behaviour. A default that would change what users see today is refused: the question keeps
// its text, its default becomes "keep the legacy behaviour" and it says why.

export const keepLegacyDefault =
  'Keep the legacy behaviour exactly as the source cards describe it.';

const refusal = 'The default first proposed would change what users see today and is not allowed.';

/** The question with a default that keeps the legacy behaviour. */
// RF-631
export function legacySafe(question: DefaultedQuestion): DefaultedQuestion {
  if (question.changesLegacy !== true) return question;
  return { ...question, answer: `${keepLegacyDefault} ${refusal}`, changesLegacy: false };
}
