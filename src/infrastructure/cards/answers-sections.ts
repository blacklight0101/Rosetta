import type {
  AnsweredQuestion,
  AnswerEntry,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import { isRunKey } from '../files/workspace-paths.js';

// RF-1007, data-model.md section 3.16: the sections of `answers.md` as lines. A section starts at
// a `## <card id> - <question>` heading and holds the `- Card:`, `- Context:` and `- Answer:` lines;
// the card line names the run that found the question. Only the answer lines of the questions
// answered change; every other line is kept as it is, with its own line end (CRLF, lone CR or LF,
// even when a file mixes them), and the file keeps its byte-order mark. A new line takes the end of
// the line before it.

const HEADING = /^## (\S+) - (.*)$/u;
const FIELD = /^- (Card|Context|Answer):(?: (.*))?$/u;

const LINE_BREAK = /\r\n|\r|\n/u;
const LINE_BREAKS = /\r\n|\r|\n/gu;
/** Splits into lines with each line's end between them: line, end, line, ..., line. */
const LINE_AND_BREAK = /(\r\n|\r|\n)/u;
const BOM = '\uFEFF';

/** The byte-order mark an editor may put before the first line ('' when there is none), and the rest. */
export function markOf(text: string): { readonly mark: string; readonly body: string } {
  return text.startsWith(BOM)
    ? { mark: BOM, body: text.slice(BOM.length) }
    : { mark: '', body: text };
}

/**
 * The end of the last line that is not blank (CRLF, lone CR or LF); when that line has none, the
 * last end the text holds; LF for a text without one.
 */
export function lastLineEndOf(text: string): string {
  const content = text.trimEnd();
  const after = LINE_BREAK.exec(text.slice(content.length));
  return after?.[0] ?? content.match(LINE_BREAKS)?.at(-1) ?? '\n';
}

/** The lines of the text, without the byte-order mark an editor may put before the first one. */
export function linesOf(text: string): string[] {
  return markOf(text).body.split(LINE_BREAK);
}

interface Section {
  readonly cardId: string;
  readonly question: string;
  card?: string;
  context?: string;
  answer?: string;
  /** The index of the `- Answer:` line, when the section has one. */
  answerLine?: number;
  /** The index of the last line of the section that is not blank. */
  lastLine: number;
}

function setField(section: Section, line: string, index: number): void {
  const found = FIELD.exec(line);
  if (found === null) return;
  const value = (found[2] ?? '').trim();
  if (found[1] === 'Card') section.card ??= value;
  else if (found[1] === 'Context') section.context ??= value;
  else if (section.answerLine === undefined) {
    section.answer = value;
    section.answerLine = index;
  }
}

function sectionsOf(lines: readonly string[]): Section[] {
  const sections: Section[] = [];
  lines.forEach((line, index) => {
    const heading = HEADING.exec(line);
    if (heading !== null) {
      sections.push({ cardId: heading[1] ?? '', question: heading[2] ?? '', lastLine: index });
      return;
    }
    const section = sections.at(-1);
    if (section === undefined || line.trim() === '') return;
    section.lastLine = index;
    setField(section, line, index);
  });
  return sections;
}

function ofRun(sections: readonly Section[], runKey: string): Section[] {
  return sections.filter(
    (section) => section.card === `runs/${runKey}/cards/OQ/${section.cardId}.md`,
  );
}

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

function recorded(section: Section): RecordedQuestion {
  const { cardId, question } = section;
  return { cardId, question, context: section.context ?? '', answer: section.answer ?? '' };
}

/** RF-1007: the questions the run added, in file order. */
export function questionsOfRun(text: string, runKey: string): RecordedQuestion[] {
  return ofRun(sectionsOf(linesOf(text)), runKey).map(recorded);
}

/**
 * RF-1007: the text with each answer (already one masked line) in its question's answer line; a
 * section without one gets it after its last line. Undefined when a card id is not a question of
 * the run.
 */
export function withAnswers(
  text: string,
  runKey: string,
  answers: readonly AnswerEntry[],
): string | undefined {
  const { mark, body } = markOf(text);
  const parts = body.split(LINE_AND_BREAK);
  const lines = parts.filter((_, index) => index % 2 === 0);
  const ends = parts.filter((_, index) => index % 2 === 1);
  const byCard = new Map(ofRun(sectionsOf(lines), runKey).map((each) => [each.cardId, each]));
  if (answers.some((entry) => !byCard.has(entry.cardId))) return undefined;
  const inserts = new Map<number, string>();
  for (const entry of answers) {
    const section = byCard.get(entry.cardId);
    if (section === undefined) continue;
    const line = entry.answer === '' ? '- Answer:' : `- Answer: ${entry.answer}`;
    if (section.answerLine === undefined) inserts.set(section.lastLine, line);
    else lines[section.answerLine] = line;
  }
  return `${mark}${lines
    .map((line, index) => {
      const end = ends[index] ?? '';
      const added = inserts.get(index);
      if (added === undefined) return `${line}${end}`;
      // The added line follows `line`, so it takes the end of `line`, or of the line before the last.
      return `${line}${end === '' ? (ends.at(-1) ?? '\n') : end}${added}${end}`;
    })
    .join('')}`;
}
