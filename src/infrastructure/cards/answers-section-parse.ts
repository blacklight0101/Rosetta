import type {
  AnswerRecord,
  RecordedQuestion,
  SuggestedOption,
} from '../../application/ports/answers-file.js';

// RF-1007, data-model.md section 3.16: the sections of `answers.md` read as lines. A section starts at
// a `## <card id> - <question>` heading and holds the `- Card:`, `- Context:`, `- Options:`,
// `- Chosen:`, `- Runs:`, `- History:` and `- Answer:` lines; the card line names the run that found
// the question. Every line is kept as it is, with its own line end (CRLF, lone CR or LF, even when a
// file mixes them), and the file keeps its byte-order mark.

const HEADING = /^## (\S+) - (.*)$/u;
const FIELD = /^- (Card|Context|Options|Chosen|Runs|History|Answer):(?: (.*))?$/u;

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

export interface Section {
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
  /** The index of the `- Runs:` line, when the section has one. */
  runsLine?: number;
  /** The runs whose cards raised the question, as the `- Runs:` line names them. */
  runs?: readonly string[];
  /** The older answers of the question kept by a merge, one `- History:` line each. */
  readonly history: AnswerRecord[];
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

const RUN_PREFIX = 'runs/';

/** The run folder names of a `- Runs:` line (`runs/<folder>, runs/<folder>`). */
function runsIn(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^runs\//u, ''))
    .filter((part) => part !== '');
}

/** One `- History:` line: `<run folder>: <answer>`; undefined for a line that is not one. */
function historyIn(value: string): AnswerRecord | undefined {
  const cut = value.indexOf(': ');
  if (cut <= 0) return undefined;
  return { runKey: value.slice(0, cut).trim(), answer: value.slice(cut + 2).trim() };
}

function setRuns(section: Section, value: string, index: number): void {
  if (section.runsLine !== undefined) return;
  section.runs = runsIn(value);
  section.runsLine = index;
}

/** The `- Runs:` line value for these run folders. */
export const runsLineOf = (runs: readonly string[]): string =>
  runs.map((run) => `${RUN_PREFIX}${run}`).join(', ');

/** The `- History:` line value of an older answer. */
export const historyLineOf = (record: AnswerRecord): string => `${record.runKey}: ${record.answer}`;

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
    Runs: setRuns,
    History: (section, value) => {
      const record = historyIn(value);
      if (record !== undefined) section.history.push(record);
    },
    Answer: setAnswer,
  };

function setField(section: Section, line: string, index: number): void {
  const found = FIELD.exec(line);
  if (found === null) return;
  SETTERS[found[1] ?? '']?.(section, (found[2] ?? '').trim(), index);
}

export function sectionsOf(lines: readonly string[]): Section[] {
  const sections: Section[] = [];
  lines.forEach((line, index) => {
    const heading = HEADING.exec(line);
    if (heading !== null) {
      sections.push({
        ...{ cardId: heading[1] ?? '', question: heading[2] ?? '', history: [] },
        lastLine: index,
      });
      return;
    }
    const section = sections.at(-1);
    if (section === undefined || line.trim() === '') return;
    section.lastLine = index;
    setField(section, line, index);
  });
  return sections;
}

export function ofRun(sections: readonly Section[], runKey: string): Section[] {
  return sections.filter(
    (section) => section.card === `runs/${runKey}/cards/OQ/${section.cardId}.md`,
  );
}

export function recorded(section: Section): RecordedQuestion {
  const { cardId, question, options } = section;
  const base = { cardId, question, context: section.context ?? '', answer: section.answer ?? '' };
  const kept = {
    ...(section.runs === undefined ? {} : { runs: section.runs }),
    ...(section.history.length === 0 ? {} : { history: section.history }),
  };
  if (options === undefined) return { ...base, ...kept };
  return { ...base, ...kept, options, chosen: section.chosen ?? '' };
}

export const fieldLine = (name: string, value: string): string =>
  value === '' ? `- ${name}:` : `- ${name}: ${value}`;

/** A text taken apart: its byte-order mark, its lines and the end of each line (the last has none). */
export interface SplitText {
  readonly mark: string;
  readonly lines: string[];
  readonly ends: readonly string[];
}

export function splitText(text: string): SplitText {
  const { mark, body } = markOf(text);
  const parts = body.split(LINE_AND_BREAK);
  return {
    mark,
    lines: parts.filter((_, index) => index % 2 === 0),
    ends: parts.filter((_, index) => index % 2 === 1),
  };
}

/** The text again, with the lines each key of `inserts` (a line index) adds after that line. */
export function joinText(
  split: SplitText,
  inserts: ReadonlyMap<number, readonly string[]>,
): string {
  const { mark, lines, ends } = split;
  return `${mark}${lines
    .map((line, index) => {
      const end = ends[index] ?? '';
      const added = inserts.get(index);
      if (added === undefined) return `${line}${end}`;
      // The added lines follow the line, so they take its end, or the end of the line before the last.
      const own = end === '' ? (ends.at(-1) ?? '\n') : end;
      return `${line}${own}${added.join(own)}${end}`;
    })
    .join('')}`;
}
