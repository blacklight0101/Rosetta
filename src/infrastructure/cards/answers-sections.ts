import type {
  AnsweredQuestion,
  AnswerEntry,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRunKey } from '../files/workspace-paths.js';
import {
  fieldLine,
  joinText,
  linesOf,
  ofRun,
  recorded,
  sectionsOf,
  splitText,
  type Section,
} from './answers-section-parse.js';

// RF-1007, data-model.md section 3.16: the answers of `answers.md` as lines. Only the answer lines of
// the questions answered change; every other line is kept as it is, with its own line end (CRLF, lone
// CR or LF, even when a file mixes them), and the file keeps its byte-order mark. A new line takes the
// end of the line before it. The section lines themselves are read in `answers-section-parse.ts`.

const CARD_LINE = /^runs\/([^/]+)\/cards\/OQ\/(OQ-\d+)\.md$/u;

/**
 * RF-241: the run a section's card line names, when the line is exactly the line the run wrote for
 * this section. A person can edit the file, so anything else (another card, a folder that is not a
 * run's, a path out of it) names no run.
 */
function runOf(section: Section): string | undefined {
  const found = CARD_LINE.exec(section.card ?? '');
  const runKey = found?.[1];
  if (runKey === undefined || found?.[2] !== section.cardId) return undefined;
  return isRunKey(runKey) ? runKey : undefined;
}

/** RF-241: the questions with an answer, of every run, in file order. */
export function answeredQuestionsOf(text: string): AnsweredQuestion[] {
  return sectionsOf(linesOf(text)).flatMap((section) => {
    const runKey = runOf(section);
    if (runKey === undefined || (section.answer ?? '') === '') return [];
    return [{ ...recorded(section), runKey }];
  });
}

/** RF-1007: the questions the run added, in file order. */
export function questionsOfRun(text: string, runKey: string): RecordedQuestion[] {
  return ofRun(sectionsOf(linesOf(text)), runKey).map(recorded);
}

interface Written {
  readonly answer: string;
  /** The `- Chosen:` value; undefined for a section without options. */
  readonly chosen: string | undefined;
}

/**
 * RF-645: what an answer writes into its section. A chosen option writes its own answer and its
 * number; any other answer of a section with options is typed, or nothing when empty. Undefined when
 * the option is not one the section lists.
 */
function writtenFor(section: Section, entry: AnswerEntry): Written | undefined {
  const { options } = section;
  if (typeof entry.chosen === 'number') {
    const option = options?.[entry.chosen - 1];
    return option === undefined
      ? undefined
      : { answer: option.answer, chosen: String(entry.chosen) };
  }
  if (options === undefined) return { answer: entry.answer, chosen: undefined };
  return { answer: entry.answer, chosen: entry.answer === '' ? '' : 'typed' };
}

/**
 * RF-1007, RF-645: the text with each answer (already one masked line) in its question's answer line
 * and, for a section with options, the chosen option in its `- Chosen:` line; a section without one
 * gets it after its last line. `unknown-question` when a card id is not a question of the run and
 * `invalid-choice` when an option number is not one of the question.
 */
export function withAnswers(
  text: string,
  runKey: string,
  answers: readonly AnswerEntry[],
): Result<string, 'unknown-question' | 'invalid-choice'> {
  const split = splitText(text);
  const { lines } = split;
  const byCard = new Map(ofRun(sectionsOf(lines), runKey).map((each) => [each.cardId, each]));
  if (answers.some((entry) => !byCard.has(entry.cardId))) return err('unknown-question');
  const inserts = new Map<number, string[]>();
  for (const entry of answers) {
    const section = byCard.get(entry.cardId);
    if (section === undefined) continue;
    const written = writtenFor(section, entry);
    if (written === undefined) return err('invalid-choice');
    const added: string[] = [];
    const put = (at: number | undefined, line: string): void => {
      if (at === undefined) added.push(line);
      else lines[at] = line;
    };
    if (written.chosen !== undefined) put(section.chosenLine, fieldLine('Chosen', written.chosen));
    put(section.answerLine, fieldLine('Answer', written.answer));
    if (added.length > 0) inserts.set(section.lastLine, added);
  }
  return ok(joinText(split, inserts));
}
