import type {
  AnsweredQuestion,
  AnswerEntry,
  AnswersFile,
  OpenQuestion,
  ProjectRef,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { projectPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  answeredQuestionsOf,
  lastLineEndOf,
  linesOf,
  markOf,
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

/** The questions the file already holds, as written in their headings. */
function questionsIn(text: string): Set<string> {
  return new Set(
    linesOf(text).flatMap((line) => {
      const found = heading.exec(line);
      return found === null ? [] : [found[1] ?? ''];
    }),
  );
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
      const { mark, body } = markOf(existing);
      const end = lastLineEndOf(body);
      const sections = questions.flatMap((question) => {
        const text = this.line(question.question);
        if (known.has(text)) return [];
        known.add(text);
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
  ): Promise<Result<readonly RecordedQuestion[], 'unknown-question'>> {
    const file = fileOf(project);
    return this.queue.run(`${file.userId}/${file.path}`, async () => {
      const existing = await this.read(file);
      const lines = answers.map((entry) => ({ ...entry, answer: this.line(entry.answer) }));
      const text = withAnswers(existing, runKey, lines);
      if (text === undefined) return err('unknown-question');
      if (text !== existing) await this.write(file, text);
      return ok(questionsOfRun(text, runKey));
    });
  }

  /** One section, its lines joined with the line end of the file's last line. */
  private section(question: OpenQuestion, text: string, end: string): string {
    return [
      `## ${question.cardId} - ${text}`,
      '',
      `- Card: runs/${question.runKey}/cards/OQ/${question.cardId}.md`,
      `- Context: ${this.line(question.context)}`,
      '- Answer:',
    ].join(end);
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
