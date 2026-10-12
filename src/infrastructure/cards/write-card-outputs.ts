import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter, WriteRefusal } from '../../application/ports/output-writer.js';
import type { Card } from '../../domain/cards/card.js';
import { err, type Result } from '../../domain/errors/result.js';
import { writeRefusal } from '../files/workspace-guard.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { serialiseCardIndex } from './card-index.js';
import { cardPath, renderCardFile } from './card-markdown.js';
import type { PermalinkSource } from './citation-link.js';
import { renderSpec } from './spec-markdown.js';
import { writeOrRestore } from './write-or-restore.js';

// RF-005, RF-204, RF-302: the card files of a run, written only through the OutputWriter port,
// inside the run folder. Every text is made and masked before the first write, so a masker that
// fails leaves no file behind (RF-141); a write that is refused or fails part-way puts the earlier
// files back as they were (RNF-002).

/** Where the files go: the run folder inside the user's workspace (data-model section 2). */
export interface CardOutputTarget {
  readonly userId: string;
  /** Relative to the workspace, forward slashes, no trailing slash. */
  readonly folder: string;
}

export interface CardOutputInput {
  /** Every card of the run so far, in area and appearance order. */
  readonly cards: readonly Card[];
  readonly source: PermalinkSource;
  readonly masker: TextMasker;
  /** Where a file that cannot be restored after a failed write is reported. */
  readonly logger: Logger;
  /** Areas whose task ended without a card; `spec.md` names them (P1-33). */
  readonly areasWithoutCards?: readonly string[];
}

interface PlannedFile {
  readonly path: string;
  readonly text: string;
}

function writeAll(
  writer: OutputWriter,
  target: CardOutputTarget,
  files: readonly PlannedFile[],
  logger: Logger,
): Promise<Result<void, WriteRefusal>> {
  const writes = files.map(({ path, text }) => ({
    file: { userId: target.userId, path: `${target.folder}/${path}` },
    text,
  }));
  return writeOrRestore(writer, logger, writes);
}

/** Writes `cards/<TYPE>/<ID>.md` for each card, then `cards/index.json` and `spec.md`. */
export async function writeCardOutputs(
  writer: OutputWriter,
  target: CardOutputTarget,
  input: CardOutputInput,
): Promise<Result<void, WriteRefusal>> {
  const { cards, source, masker, logger, areasWithoutCards = [] } = input;
  const files: PlannedFile[] = [
    ...cards.map((card) => ({
      path: cardPath(card),
      text: renderCardFile(card, source, masker),
    })),
    { path: 'cards/index.json', text: serialiseCardIndex(cards, masker) },
    { path: 'spec.md', text: renderSpec(cards, source, masker, areasWithoutCards) },
  ];
  return writeAll(writer, target, files, logger);
}

export interface InvalidOutputInput {
  readonly agentTaskId: string;
  /** The first answer and the repaired one, when there was one. */
  readonly rawOutputs: readonly string[];
  readonly masker: TextMasker;
  readonly logger: Logger;
}

const plainId = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?$/;
// Windows device names are reserved with or without an extension.
const reservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function isPlainTaskId(id: string): boolean {
  return plainId.test(id) && !reservedName.test(id);
}

// RF-202: the raw output of a task marked `InvalidOutput` is kept for the user, masked, in
// `invalid-output/<agentTaskId>.txt`. The task id chooses the file name, so it must be a plain id.
export async function writeInvalidOutput(
  writer: OutputWriter,
  target: CardOutputTarget,
  input: InvalidOutputInput,
): Promise<Result<void, WriteRefusal>> {
  if (!isPlainTaskId(input.agentTaskId)) return err(writeRefusal('invalid-path'));
  const attempts = input.rawOutputs.map(
    (raw, index) => `=== attempt ${String(index + 1)} ===\n${raw}`,
  );
  const text = `${input.masker.mask(attempts.join('\n\n')).text}\n`;
  const path = `invalid-output/${input.agentTaskId}.txt`;
  return writeAll(writer, target, [{ path, text }], input.logger);
}
