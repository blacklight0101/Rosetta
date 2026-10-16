import type { ProjectRef } from '../../application/ports/answers-file.js';
import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { PlanningBriefStore } from '../../application/ports/planning-brief-store.js';
import { parsePlanningBrief } from '../../application/planning/planning-brief-schema.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { projectPath } from './workspace-paths.js';

// RF-605, RNF-003, data-model.md section 3.20: `planning-brief.json` in the project folder of the
// owner's workspace, written through the OutputWriter (atomically) and masked like every file
// Rosetta writes; the free text of the answers is untrusted. A file that is not a version 1 brief is
// an error (RST-2006), never guessed.

export interface FilePlanningBriefStoreOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

function fileOf(project: ProjectRef): WorkspaceFile {
  return { userId: project.userId, path: `${projectPath(project.projectId)}/planning-brief.json` };
}

function unreadable(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.unexpected,
    `The planning brief could not be stored or read: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw unreadable('the file is not JSON', error);
  }
}

export class FilePlanningBriefStore implements PlanningBriefStore {
  private readonly options: FilePlanningBriefStoreOptions;

  constructor(options: FilePlanningBriefStoreOptions) {
    this.options = options;
  }

  // RF-605
  async read(project: ProjectRef): Promise<PlanningBrief | undefined> {
    const read = await this.options.writer.readText(fileOf(project));
    if (!read.ok) {
      if (read.error.reason === 'not-found') return undefined;
      throw unreadable(read.error.message);
    }
    const brief = parsePlanningBrief(parseJson(read.value));
    if (brief === undefined) throw unreadable('the file is not a version 1 brief');
    return brief;
  }

  // RF-605, RNF-003
  async write(project: ProjectRef, brief: PlanningBrief): Promise<void> {
    const masked = parsePlanningBrief(maskDeep(brief, this.options.masker));
    if (masked === undefined) throw new RosettaError(ERROR_CODES.secretMaskingFailed);
    const written = await this.options.writer.writeText(
      fileOf(project),
      `${JSON.stringify(masked, null, 2)}\n`,
    );
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
  }
}
