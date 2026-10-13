import type { AnswerEntry, RecordedQuestion } from '../../application/ports/answers-file.js';

// RF-1007, data-model.md section 3.16: the sections of `answers.md` as lines. A section starts at
// a `## <card id> - <question>` heading and holds the `- Card:`, `- Context:` and `- Answer:` lines;
// the card line names the run that found the question. Only the answer lines of the questions
// answered change; every other line is kept as it is, with the file's own line ends (CRLF, lone CR
// or LF) and its byte-order mark.

const HEADING = /^## (\S+) - (.*)$/u;
const FIELD = /^- (Card|Context|Answer):(?: (.*))?$/u;

const LINE_BREAK = /\r\n|\r|\n/u;
const BOM = '\uFEFF';

/** The file's own line end: CRLF when it holds one, else a lone CR (old Mac) when it holds one, else LF. */
export function lineEndOf(text: string): string {
  if (text.includes('\r\n')) return '\r\n';
  return text.includes('\r') ? '\r' : '\n';
}

/** The lines of the text, without the byte-order mark an editor may put before the first one. */
export function linesOf(text: string): string[] {
  return (text.startsWith(BOM) ? text.slice(BOM.length) : text).split(LINE_BREAK);
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
  const lines = linesOf(text);
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
  const mark = text.startsWith(BOM) ? BOM : '';
  return `${mark}${lines
    .flatMap((line, index) => {
      const added = inserts.get(index);
      return added === undefined ? [line] : [line, added];
    })
    .join(lineEndOf(text))}`;
}
