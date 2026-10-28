import type {
  AnsweredQuestion,
  AnswerEntry,
  AnswersFile,
  OpenQuestion,
  ProjectRef,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import { questionWords } from '../../application/understand/open-questions.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import { ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { projectPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  answeredQuestionsOf,
  lastLineEndOf,
  linesOf,
  markOf,
  optionsLineOf,
  questionsOfRun,
  withAnswers,
} from './answers-sections.js';

// RF-240, DEC-98, data-model.md section 3.16: the project's `answers.md`. A run adds one section per
// open question it found that the file does not hold yet (matched by the question text), after the
// sections already there, which are kept byte for byte with their answers. Model text is masked
// as written, before its whitespace is collapsed and once more after (a secret that only the
// collapse joins to its key), and written on one line, so it cannot start a heading, an answer line
// or a new section. Writes to one project's file run one after another. The page records the answers to one run's questions
// (RF-1007): each answer is masked and written on its question's answer line, and nothing else in
// the file changes. The file is kept byte for byte, its byte-order mark too (also in a file that
// holds only the mark); appended lines take the end of the file's last line.

export interface FileAnswersFileOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

const TITLE = '# Answers to open questions';
const heading = /^## \S+ - (.*)$/u;

function fileOf(project: ProjectRef): WorkspaceFile {
  return { userId: project.userId, path: `${projectPath(project.projectId)}/answers.md` };
}

/** RF-646, Q-52: two questions that ask the same have the same words, whatever the case and marks. */
function askedBy(text: string): string {
  const words = questionWords(text);
  return words === '' ? text : words;
}

/** The questions the file already holds: as written, and by the words they ask. */
function questionsIn(text: string): Set<string> {
  return new Set(
    linesOf(text).flatMap((line) => {
      const found = heading.exec(line);
      return found === null ? [] : [found[1] ?? '', askedBy(found[1] ?? '')];
    }),
  );
}

/** P5-11: whether the run of the question already has a section under the question's card id. */
function hasId(text: string, question: OpenQuestion): boolean {
  return questionsOfRun(text, question.runKey).some((each) => each.cardId === question.cardId);
}

export class FileAnswersFile implements AnswersFile {
  private readonly options: FileAnswersFileOptions;
  private readonly queue = new KeyedQueue();

  constructor(options: FileAnswersFileOptions) {
    this.options = options;
  }

  // RF-240
  addQuestions(project: ProjectRef, questions: readonly OpenQuestion[]): Promise<void> {
    const file = fileOf(project);
    return this.queue.run(`${file.userId}/${file.path}`, async () => {
      const existing = await this.read(file);
      const known = questionsIn(existing);
      const added = new Set<string>();
      const { mark, body } = markOf(existing);
      const end = lastLineEndOf(body);
      const sections = questions.flatMap((question) => {
        const text = this.line(question.question);
        const held =
          question.survivor === true
            ? hasId(existing, question)
            : added.has(text) || known.has(text) || known.has(askedBy(text));
        if (held) return [];
        added.add(text);
        return [this.section(question, text, end)];
      });
      if (sections.length === 0) return;
      const head = body.trimEnd() === '' ? TITLE : body.trimEnd();
      await this.write(file, `${mark}${[head, ...sections].join(end + end)}${end}`);
    });
  }

  // RF-1007
  async questionsOf(project: ProjectRef, runKey: string): Promise<readonly RecordedQuestion[]> {
    return questionsOfRun(await this.read(fileOf(project)), runKey);
  }

  // RF-241
  async answeredQuestions(project: ProjectRef): Promise<readonly AnsweredQuestion[]> {
    return answeredQuestionsOf(await this.read(fileOf(project)));
  }

  // RF-1007
  recordAnswers(
    project: ProjectRef,
    runKey: string,
    answers: readonly AnswerEntry[],
  ): Promise<Result<readonly RecordedQuestion[], 'unknown-question' | 'invalid-choice'>> {
    const file = fileOf(project);
    return this.queue.run(`${file.userId}/${file.path}`, async () => {
      const existing = await this.read(file);
      const lines = answers.map((entry) => ({ ...entry, answer: this.line(entry.answer) }));
      const text = withAnswers(existing, runKey, lines);
      if (!text.ok) return text;
      if (text.value !== existing) await this.write(file, text.value);
      return ok(questionsOfRun(text.value, runKey));
    });
  }

  /** One section, its lines joined with the line end of the file's last line. */
  private section(question: OpenQuestion, text: string, end: string): string {
    const options = this.optionsLine(question);
    return [
      `## ${question.cardId} - ${text}`,
      '',
      `- Card: runs/${question.runKey}/cards/OQ/${question.cardId}.md`,
      `- Context: ${this.line(question.context)}`,
      ...(options === '' ? [] : [`- Options: ${options}`, '- Chosen:']),
      '- Answer:',
    ].join(end);
  }

  /** RF-645: the suggested answers of the question on one line, masked; '' when it has none. */
  private optionsLine(question: OpenQuestion): string {
    const options = (question.options ?? [])
      .map((option) => ({
        ...option,
        answer: this.line(option.answer),
        description: this.line(option.description),
      }))
      .filter((option) => option.answer !== '');
    return optionsLineOf(options);
  }

  /** Masked text on one line: masked as written, then its whitespace collapsed (P2-42). */
  private line(text: string): string {
    const { masker } = this.options;
    return masker.mask(masker.mask(text).text.replace(/\s+/gu, ' ').trim()).text;
  }

  private async read(file: WorkspaceFile): Promise<string> {
    const read = await this.options.writer.readText(file);
    if (read.ok) return read.value;
    if (read.error.reason === 'not-found') return '';
    throw new RosettaError(read.error.code, read.error.message);
  }

  private async write(file: WorkspaceFile, text: string): Promise<void> {
    const written = await this.options.writer.writeText(file, text);
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
  }
}
