import type { ListAnswers } from '../../application/use-cases/list-answers.js';
import type { RecordAnswers } from '../../application/use-cases/record-answers.js';

// RF-1007, RF-240, RF-1105: the open questions of a run on its live page (routes not built yet).

export interface AnswerServices {
  readonly listAnswers: ListAnswers;
  readonly recordAnswers: RecordAnswers;
}
