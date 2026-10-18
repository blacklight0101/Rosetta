import type { DefaultedQuestion } from './brief-questions.js';

// RF-631, DEC-80, DEC-135: skeleton.

export const keepLegacyDefault = '';

export function legacySafe(question: DefaultedQuestion): DefaultedQuestion {
  return question;
}
