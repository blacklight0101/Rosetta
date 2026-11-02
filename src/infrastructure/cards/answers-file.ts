import type {
  AnsweredQuestion,
  AnswerEntry,
  AnswersFile,
  OpenQuestion,
  ProjectRef,
  MergeEdit,
  RecordedQuestion,
} from '../../application/ports/answers-file.js';
import type { MergedQuestion } from '../../application/understand/open-questions.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import { sameQuestion } from '../../application/understand/open-questions.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import { ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { projectPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { lastLineEndOf, markOf, optionsLineOf } from './answers-section-parse.js';
import { withMerges } from './answers-merge.js';
import {
  answeredQuestionsOf,
  heldQuestions,
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

function fileOf(project: ProjectRef): WorkspaceFile {
  return { userId: project.userId, path: `${projectPath(project.projectId)}/answers.md` };
}

/** EV-57: the question a new one is merged into (the same words added earlier in the batch, else one the file holds). */
function mergeTarget(
  text: string,
  seen: {
    readonly added: ReadonlyMap<string, OpenQuestion>;
    readonly held: ReturnType<typeof heldQuestions>;
  },
): Pick<MergedQuestion, 'keptCardId' | 'keptQuestion' | 'keptRunKey'> | undefined {
  const same = (each: string): boolean => each === text || sameQuestion(each, text);
  const earlier = seen.added.get(text);
  if (earlier !== undefined)
    return {
      keptCardId: earlier.cardId,
      keptQuestion: earlier.question,
      keptRunKey: earlier.runKey,
    };
  const kept = seen.held.find((each) => same(each.question));
  if (kept === undefined) return undefined;
  return { keptCardId: kept.cardId, keptQuestion: kept.question, keptRunKey: kept.runKey };
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
  addQuestions(
    project: ProjectRef,
    questions: readonly OpenQuestion[],
  ): Promise<readonly MergedQuestion[]> {
    const file = fileOf(project);
    return this.queue.run(`${file.userId}/${file.path}`, async () => {
      const existing = await this.read(file);
      const held = heldQuestions(existing);
      const added = new Map<string, OpenQuestion>();
      const merged: MergedQuestion[] = [];
      const { mark, body } = markOf(existing);
      const end = lastLineEndOf(body);
      const sections = questions.flatMap((question) => {
        const text = this.line(question.question);
        if (question.survivor === true ? hasId(existing, question) : false) return [];
        const same = question.survivor === true ? undefined : mergeTarget(text, { added, held });
        if (same !== undefined) {
          merged.push({
            ...same,
            mergedCardId: question.cardId,
            mergedQuestion: text,
            mergedRunKey: question.runKey,
          });
          return [];
        }
        added.set(text, question);
        return [this.section(question, text, end)];
      });
      if (sections.length === 0) return merged;
      const head = body.trimEnd() === '' ? TITLE : body.trimEnd();
      await this.write(file, `${mark}${[head, ...sections].join(end + end)}${end}`);
      return merged;
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

  // RF-646
  keepMerge(project: ProjectRef, edits: readonly MergeEdit[]): Promise<void> {
    const file = fileOf(project);
    return this.queue.run(`${file.userId}/${file.path}`, async () => {
      const existing = await this.read(file);
      const masked = edits.map((edit) => ({
        ...edit,
        history: edit.history.map((each) => ({ ...each, answer: this.line(each.answer) })),
      }));
      const text = withMerges(existing, masked);
      if (text !== existing) await this.write(file, text);
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
