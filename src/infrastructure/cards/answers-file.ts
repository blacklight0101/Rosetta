import type {
  AnswerEntry,
  AnswersFile,
  OpenQuestion,
  ProjectRef,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import { ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { projectPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-240, DEC-98, data-model.md section 3.16: the project's `answers.md`. A run adds one section per
// open question it found that the file does not hold yet (matched by the question text), after the
// sections already there, which are kept byte for byte with their answers. Model text is masked
// and written on one line, so it cannot start a heading, an answer line or a new section. Writes
// to one project's file run one after another. The page records the answers to one run's questions
// (RF-1007): each answer is masked and written on its question's answer line, and nothing else in
// the file changes.

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
    text.split(/\r?\n/u).flatMap((line) => {
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
      const sections = questions.flatMap((question) => {
        const text = this.line(question.question);
        if (known.has(text)) return [];
        known.add(text);
        return [this.section(question, text)];
      });
      if (sections.length === 0) return;
      const head = existing.trimEnd() === '' ? TITLE : existing.trimEnd();
      await this.write(file, `${[head, ...sections].join('\n\n')}\n`);
    });
  }

  // RF-1007 (not built yet)
  questionsOf(project: ProjectRef, runKey: string): Promise<readonly RecordedQuestion[]> {
    void [project, runKey];
    return Promise.resolve([]);
  }

  // RF-1007 (not built yet)
  recordAnswers(
    project: ProjectRef,
    runKey: string,
    answers: readonly AnswerEntry[],
  ): Promise<Result<readonly RecordedQuestion[], 'unknown-question'>> {
    void [project, runKey, answers];
    return Promise.resolve(ok([]));
  }

  private section(question: OpenQuestion, text: string): string {
    return [
      `## ${question.cardId} - ${text}`,
      '',
      `- Card: runs/${question.runKey}/cards/OQ/${question.cardId}.md`,
      `- Context: ${this.line(question.context)}`,
      '- Answer:',
    ].join('\n');
  }

  /** Masked text on one line. */
  private line(text: string): string {
    return this.options.masker.mask(text.replace(/\s+/gu, ' ').trim()).text;
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
