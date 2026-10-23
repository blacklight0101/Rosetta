import type {
  AnsweredQuestion,
  AnswersFile,
  ProjectRef,
  RecordedQuestion,
} from '../../src/application/ports/answers-file.js';
import type { PriorCards } from '../../src/application/ports/prior-cards.js';
import type { ReportDownloads } from '../../src/application/ports/report-downloads.js';
import type { ReportCardFiles } from '../../src/application/ports/report-card-files.js';
import type { ReportWriter } from '../../src/application/ports/report-writer.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import type { CardFile } from '../../src/application/report/card-evidence.js';
import type {
  ReportDownloadNames,
  ReportModel,
} from '../../src/application/report/report-model.js';
import { ok, type Result } from '../../src/domain/errors/result.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { FixedClock } from './fixed-clock.js';

// RF-504, RF-506: stand-ins for the report ports in unit and route tests.

/** Keeps the models it was asked to write and says it wrote the two main files. */
export class RecordingReportWriter implements ReportWriter {
  readonly written: { readonly scope: RunScope; readonly model: ReportModel }[] = [];

  write(scope: RunScope, model: ReportModel): Promise<readonly string[]> {
    this.written.push({ scope, model });
    return Promise.resolve(['report/report.md', 'report/report.html']);
  }
}

/** Keeps the zips it was asked to write; writes none. */
export class RecordingReportDownloads implements ReportDownloads {
  readonly written: { readonly scope: RunScope; readonly names: ReportDownloadNames }[] = [];

  write(scope: RunScope, names: ReportDownloadNames): Promise<void> {
    this.written.push({ scope, names });
    return Promise.resolve();
  }
}

/** Text files by path, the same for every run. */
export class MapRunTextFiles implements RunTextFiles {
  private readonly files: Readonly<Record<string, string>>;

  constructor(files: Readonly<Record<string, string>> = {}) {
    this.files = files;
  }

  read(_scope: RunScope, path: string): Promise<string | undefined> {
    return Promise.resolve(this.files[path]);
  }
}

/** The questions of runs by folder name; the project is ignored. Nothing else is stored. */
export class QuestionsByRun implements AnswersFile {
  private readonly questions: Readonly<Record<string, readonly RecordedQuestion[]>>;

  constructor(questions: Readonly<Record<string, readonly RecordedQuestion[]>> = {}) {
    this.questions = questions;
  }

  addQuestions(): Promise<void> {
    return Promise.resolve();
  }

  questionsOf(_project: ProjectRef, runKey: string): Promise<readonly RecordedQuestion[]> {
    return Promise.resolve(this.questions[runKey] ?? []);
  }

  answeredQuestions(): Promise<readonly AnsweredQuestion[]> {
    return Promise.resolve([]);
  }

  recordAnswers(): Promise<Result<readonly RecordedQuestion[], 'unknown-question'>> {
    return Promise.resolve(ok([]));
  }
}

/** The card files of a test, the same for every run; remembers the paths it was asked for. */
export class FixedReportCards implements ReportCardFiles {
  readonly asked: (readonly string[])[] = [];
  private readonly cards: readonly CardFile[];

  constructor(cards: readonly CardFile[] = []) {
    this.cards = cards;
  }

  read(_scope: RunScope, paths: readonly string[]): Promise<readonly CardFile[]> {
    this.asked.push(paths);
    return Promise.resolve(this.cards);
  }
}

/** The ports `BuildReport` reads the figures of the report from: no questions, no ledger rows. */
export function reportFigures(): {
  readonly answers: QuestionsByRun;
  readonly costs: MemoryCostTotals;
  readonly clock: FixedClock;
  readonly cards: FixedReportCards;
  readonly priorCards: Pick<PriorCards, 'cardsOf'>;
  readonly downloads: RecordingReportDownloads;
} {
  return {
    answers: new QuestionsByRun(),
    costs: new MemoryCostTotals(),
    clock: new FixedClock('2026-10-12T11:00:00.000Z'),
    cards: new FixedReportCards(),
    priorCards: { cardsOf: () => Promise.resolve([]) },
    downloads: new RecordingReportDownloads(),
  };
}
