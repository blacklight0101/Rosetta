import type {
  AnsweredQuestion,
  AnswerEntry,
  RecordedQuestion,
  SuggestedOption,
} from '../../application/ports/answers-file.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRunKey } from '../files/workspace-paths.js';

// RF-1007, data-model.md section 3.16: the sections of `answers.md` as lines. A section starts at
// a `## <card id> - <question>` heading and holds the `- Card:`, `- Context:` and `- Answer:` lines;
// the card line names the run that found the question. Only the answer lines of the questions
// answered change; every other line is kept as it is, with its own line end (CRLF, lone CR or LF,
// even when a file mixes them), and the file keeps its byte-order mark. A new line takes the end of
// the line before it.

const HEADING = /^## (\S+) - (.*)$/u;
const FIELD = /^- (Card|Context|Options|Chosen|Answer):(?: (.*))?$/u;

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
  /** RF-645: the suggested answers; undefined for a section written before DEC-178. */
  options?: readonly SuggestedOption[] | undefined;
  chosen?: string;
  /** The index of the `- Chosen:` line, when the section has one. */
  chosenLine?: number;
  /** The index of the `- Answer:` line, when the section has one. */
  answerLine?: number;
  /** The index of the last line of the section that is not blank. */
  lastLine: number;
}

const RECOMMENDED = '(Recommended) ';
const OPTION_SEPARATOR = '; ';
const DESCRIPTION_SEPARATOR = ' - ';

/**
 * RF-645: the `- Options:` line for suggested answers whose text is already masked and on one line:
 * the separators of the format are removed from the text, so a line parses back to the same options.
 */
export function optionsLineOf(options: readonly SuggestedOption[]): string {
  return options
    .map((option) => {
      const answer = option.answer.replaceAll(';', ',').replaceAll(DESCRIPTION_SEPARATOR, ' / ');
      const description = option.description.replaceAll(';', ',');
      const text = description === '' ? answer : `${answer}${DESCRIPTION_SEPARATOR}${description}`;
      return option.recommended ? `${RECOMMENDED}${text}` : text;
    })
    .join(OPTION_SEPARATOR);
}

/** RF-645: the options of an `- Options:` line; undefined when it holds none. */
function optionsIn(value: string): readonly SuggestedOption[] | undefined {
  const options = value
    .split(OPTION_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part): SuggestedOption => {
      const recommended = part.startsWith(RECOMMENDED);
      const text = recommended ? part.slice(RECOMMENDED.length) : part;
      const cut = text.indexOf(DESCRIPTION_SEPARATOR);
      const answer = cut < 0 ? text : text.slice(0, cut);
      return {
        answer,
        description: cut < 0 ? '' : text.slice(cut + DESCRIPTION_SEPARATOR.length),
        recommended,
      };
    });
  return options.length === 0 ? undefined : options;
}

function setAnswer(section: Section, value: string, index: number): void {
  if (section.answerLine !== undefined) return;
  section.answer = value;
  section.answerLine = index;
}

function setChosen(section: Section, value: string, index: number): void {
  if (section.chosenLine !== undefined) return;
  section.chosen = value;
  section.chosenLine = index;
}

const SETTERS: Readonly<Record<string, (section: Section, value: string, index: number) => void>> =
  {
    Card: (section, value) => {
      section.card ??= value;
    },
    Context: (section, value) => {
      section.context ??= value;
    },
    Options: (section, value) => {
      section.options ??= optionsIn(value);
    },
    Chosen: setChosen,
    Answer: setAnswer,
  };

function setField(section: Section, line: string, index: number): void {
  const found = FIELD.exec(line);
  if (found === null) return;
  SETTERS[found[1] ?? '']?.(section, (found[2] ?? '').trim(), index);
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
  const { cardId, question, options } = section;
  const base = { cardId, question, context: section.context ?? '', answer: section.answer ?? '' };
  if (options === undefined) return base;
  return { ...base, options, chosen: section.chosen ?? '' };
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

const fieldLine = (name: string, value: string): string =>
  value === '' ? `- ${name}:` : `- ${name}: ${value}`;

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
  const { mark, body } = markOf(text);
  const parts = body.split(LINE_AND_BREAK);
  const lines = parts.filter((_, index) => index % 2 === 0);
  const ends = parts.filter((_, index) => index % 2 === 1);
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
  return ok(
    `${mark}${lines
      .map((line, index) => {
        const end = ends[index] ?? '';
        const added = inserts.get(index);
        if (added === undefined) return `${line}${end}`;
        // The added lines follow the line, so they take its end, or the end of the line before the last.
        const own = end === '' ? (ends.at(-1) ?? '\n') : end;
        return `${line}${own}${added.join(own)}${end}`;
      })
      .join('')}`,
  );
}
