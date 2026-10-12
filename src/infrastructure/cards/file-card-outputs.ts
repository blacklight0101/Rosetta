import type { CardOutputs, CardSet } from '../../application/ports/card-outputs.js';
import type { AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter, WriteRefusal } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import type { Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  writeCardOutputs,
  writeCoverageOutputs,
  writeInvalidOutput,
  type CardOutputTarget,
} from './write-card-outputs.js';

// RF-204, RF-302, RNF-002, P1-32 notes: the card files of a run through the OutputWriter. Every
// write of one run folder waits for the one before it, because two rewrites of the same files that
// interleave could leave the index of one set next to the cards of another; each write restores
// what it changed when it fails part-way, and a refusal is thrown with the writer's code.

export interface FileCardOutputsOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  /** Where a file that cannot be restored after a failed write is reported. */
  readonly logger: Logger;
}

function targetOf(scope: RunScope): CardOutputTarget {
  return { userId: scope.userId, folder: runPath(scope.projectId, scope.runKey) };
}

function thrown(result: Result<void, WriteRefusal>): void {
  if (!result.ok) throw new RosettaError(result.error.code, result.error.message);
}

export class FileCardOutputs implements CardOutputs {
  private readonly options: FileCardOutputsOptions;
  private readonly queue = new KeyedQueue();

  constructor(options: FileCardOutputsOptions) {
    this.options = options;
  }

  // RF-204, RF-302
  writeCards(scope: RunScope, set: CardSet): Promise<void> {
    const { writer, masker, logger } = this.options;
    const target = targetOf(scope);
    return this.serial(target, async () => {
      thrown(await writeCardOutputs(writer, target, { ...set, masker, logger }));
    });
  }

  // RF-230
  writeCoverage(scope: RunScope, coverage: readonly AreaCoverage[]): Promise<void> {
    const { writer, masker, logger } = this.options;
    const target = targetOf(scope);
    return this.serial(target, async () => {
      thrown(await writeCoverageOutputs(writer, target, { coverage, masker, logger }));
    });
  }

  // RF-202
  writeInvalidOutput(
    scope: RunScope,
    agentTaskId: string,
    rawOutputs: readonly string[],
  ): Promise<void> {
    const { writer, masker, logger } = this.options;
    const target = targetOf(scope);
    return this.serial(target, async () => {
      thrown(await writeInvalidOutput(writer, target, { agentTaskId, rawOutputs, masker, logger }));
    });
  }

  private serial(target: CardOutputTarget, task: () => Promise<void>): Promise<void> {
    return this.queue.run(`${target.userId}/${target.folder}`, task);
  }
}
