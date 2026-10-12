import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../application/ports/output-writer.js';
import type { Card } from '../../domain/cards/card.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { writeRefusal } from '../files/workspace-guard.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { serialiseCardIndex } from './card-index.js';
import { cardPath, renderCardFile } from './card-markdown.js';
import type { PermalinkSource } from './citation-link.js';
import { renderSpec } from './spec-markdown.js';

// RF-005, RF-204, RF-302: the card files of a run, written only through the OutputWriter port,
// inside the run folder. Every text is made and masked before the first write, so a masker that
// fails leaves no file behind (RF-141).

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
}

interface PlannedFile {
  readonly path: string;
  readonly text: string;
}

/** Writes the files in order; a refusal removes the files this call already wrote (RNF-002). */
async function writeAll(
  writer: OutputWriter,
  target: CardOutputTarget,
  files: readonly PlannedFile[],
): Promise<Result<void, WriteRefusal>> {
  const written: WorkspaceFile[] = [];
  for (const file of files) {
    const workspaceFile = { userId: target.userId, path: `${target.folder}/${file.path}` };
    const result = await writer.writeText(workspaceFile, file.text);
    if (!result.ok) {
      for (const done of written) await writer.remove(done);
      return result;
    }
    written.push(workspaceFile);
  }
  return ok(undefined);
}

/** Writes `cards/<TYPE>/<ID>.md` for each card, then `cards/index.json` and `spec.md`. */
export async function writeCardOutputs(
  writer: OutputWriter,
  target: CardOutputTarget,
  input: CardOutputInput,
): Promise<Result<void, WriteRefusal>> {
  const { cards, source, masker } = input;
  const files: PlannedFile[] = [
    ...cards.map((card) => ({
      path: cardPath(card),
      text: renderCardFile(card, source, masker),
    })),
    { path: 'cards/index.json', text: serialiseCardIndex(cards, masker) },
    { path: 'spec.md', text: renderSpec(cards, source, masker) },
  ];
  return writeAll(writer, target, files);
}

export interface InvalidOutputInput {
  readonly agentTaskId: string;
  /** The first answer and the repaired one, when there was one. */
  readonly rawOutputs: readonly string[];
  readonly masker: TextMasker;
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
  return writeAll(writer, target, [{ path: `invalid-output/${input.agentTaskId}.txt`, text }]);
}
