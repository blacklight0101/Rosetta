import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { KeptAnswers, PlannerAnswers } from '../../application/ports/planner-answers.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { runPath } from './workspace-paths.js';

// RF-432, RF-141, RNF-002, P8-01, data-model.md section 3.7c: `planner-answers.json` in the run
// folder of a plan run, the planner answers it paid for, through the OutputWriter (inside the
// owner's workspace, replaced atomically) and masked like every file Rosetta writes. A file that
// is missing or is not a version 2 file reads as none: the run then asks again, and never trusts
// an answer it cannot read. The fingerprint is the SHA-256 of the inputs' text, in hexadecimal.

export interface FilePlannerAnswersOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

const ANSWERS_FILE = 'planner-answers.json';

const fileSchema = z.object({
  schemaVersion: z.literal(2),
  inputsSha256: z.string(),
  callsTaken: z.number().int().min(0),
  answers: z.record(z.string(), z.string()),
  progress: z.record(
    z.string(),
    z.object({ text: z.string(), continued: z.number().int().min(0) }),
  ),
});

function fileOf(scope: RunScope): WorkspaceFile {
  return {
    userId: scope.userId,
    path: `${runPath(scope.projectId, scope.runKey)}/${ANSWERS_FILE}`,
  };
}

function parsed(text: string): KeptAnswers | undefined {
  try {
    const read = fileSchema.safeParse(JSON.parse(text));
    if (!read.success) return undefined;
    const { inputsSha256, callsTaken, answers, progress } = read.data;
    return { inputs: inputsSha256, callsTaken, answers, progress };
  } catch {
    return undefined;
  }
}

export class FilePlannerAnswers implements PlannerAnswers {
  private readonly options: FilePlannerAnswersOptions;

  constructor(options: FilePlannerAnswersOptions) {
    this.options = options;
  }

  // RF-432
  async read(scope: RunScope): Promise<KeptAnswers | undefined> {
    const read = await this.options.writer.readText(fileOf(scope));
    return read.ok ? parsed(read.value) : undefined;
  }

  // RF-432, RF-141
  async write(scope: RunScope, kept: KeptAnswers): Promise<void> {
    const { inputs, callsTaken, answers, progress } = kept;
    const file = { schemaVersion: 2, inputsSha256: inputs, callsTaken, answers, progress };
    const text = `${JSON.stringify(maskDeep(file, this.options.masker), null, 2)}\n`;
    const written = await this.options.writer.writeText(fileOf(scope), text);
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
  }

  // RF-432
  fingerprint(inputs: string): string {
    return createHash('sha256').update(inputs, 'utf8').digest('hex');
  }
}
