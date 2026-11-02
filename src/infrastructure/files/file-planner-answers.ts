import { z } from 'zod';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { PlannerAnswers } from '../../application/ports/planner-answers.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { runPath } from './workspace-paths.js';

// RF-432, RF-141, RNF-002, P8-01, data-model.md section 3.7c: `planner-answers.json` in the run
// folder of a plan run, the planner answers it paid for, through the OutputWriter (inside the
// owner's workspace, replaced atomically) and masked like every file Rosetta writes. A file that
// is missing or is not a version 1 file reads as none: the run then asks again, and never trusts
// an answer it cannot read.

export interface FilePlannerAnswersOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

const ANSWERS_FILE = 'planner-answers.json';

const fileSchema = z.object({
  schemaVersion: z.literal(1),
  answers: z.record(z.string(), z.string()),
});

function fileOf(scope: RunScope): WorkspaceFile {
  return {
    userId: scope.userId,
    path: `${runPath(scope.projectId, scope.runKey)}/${ANSWERS_FILE}`,
  };
}

function parsed(text: string): Readonly<Record<string, string>> {
  try {
    const read = fileSchema.safeParse(JSON.parse(text));
    return read.success ? read.data.answers : {};
  } catch {
    return {};
  }
}

export class FilePlannerAnswers implements PlannerAnswers {
  private readonly options: FilePlannerAnswersOptions;

  constructor(options: FilePlannerAnswersOptions) {
    this.options = options;
  }

  // RF-432
  async read(scope: RunScope): Promise<Readonly<Record<string, string>>> {
    const read = await this.options.writer.readText(fileOf(scope));
    return read.ok ? parsed(read.value) : {};
  }

  // RF-432, RF-141
  async write(scope: RunScope, answers: Readonly<Record<string, string>>): Promise<void> {
    const masked = maskDeep({ schemaVersion: 1, answers }, this.options.masker);
    const text = `${JSON.stringify(masked, null, 2)}\n`;
    const written = await this.options.writer.writeText(fileOf(scope), text);
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
  }
}
