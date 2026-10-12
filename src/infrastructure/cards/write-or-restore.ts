import type { Logger, LogValue } from '../../application/ports/logger.js';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../application/ports/output-writer.js';
import { ok, type Result } from '../../domain/errors/result.js';

// RF-302, RNF-002: a set of files written together is written whole or not at all. Before each
// file is written its previous content is read; when a later write is refused or fails, every
// file this call wrote gets its exact previous content back and a file that did not exist before
// is removed. Earlier cards, with their claims and verdicts, are never lost to a failed rewrite.

export interface PlannedWrite {
  readonly file: WorkspaceFile;
  readonly text: string;
}

interface Written {
  readonly file: WorkspaceFile;
  /** The content before this call, or `undefined` when the file did not exist. */
  readonly previous: string | undefined;
}

/** The current content of a file, `undefined` when it does not exist, or the refusal. */
async function previousText(
  writer: OutputWriter,
  file: WorkspaceFile,
): Promise<Result<string | undefined, WriteRefusal>> {
  const read = await writer.readText(file);
  if (read.ok || read.error.reason !== 'not-found') return read;
  return ok(undefined);
}

async function writeEach(
  writer: OutputWriter,
  writes: readonly PlannedWrite[],
  written: Written[],
): Promise<Result<void, WriteRefusal>> {
  for (const { file, text } of writes) {
    const previous = await previousText(writer, file);
    if (!previous.ok) return previous;
    const result = await writer.writeText(file, text);
    if (!result.ok) return result;
    written.push({ file, previous: previous.value });
  }
  return ok(undefined);
}

/** Why one file could not be put back, or `undefined` when it was. */
async function restoreOne(writer: OutputWriter, entry: Written): Promise<string | undefined> {
  try {
    const result =
      entry.previous === undefined
        ? await writer.remove(entry.file)
        : await writer.writeText(entry.file, entry.previous);
    return result.ok ? undefined : result.error.message;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : 'unknown error';
  }
}

/** Puts every written file back, newest first; a file that cannot be put back is logged. */
async function restore(
  writer: OutputWriter,
  logger: Logger,
  written: readonly Written[],
): Promise<void> {
  const failures: LogValue[] = [];
  for (const entry of [...written].reverse()) {
    const problem = await restoreOne(writer, entry);
    if (problem !== undefined) failures.push({ path: entry.file.path, problem });
  }
  const [first] = written;
  if (failures.length === 0 || first === undefined) return;
  await logger.log({
    level: 'error',
    logger: 'cards',
    message: 'Card files could not be restored after a failed write.',
    userId: first.file.userId,
    data: { failures },
  });
}

/**
 * Writes the files in order. On a refusal the earlier files are restored and the refusal is
 * returned; on a thrown error they are restored and the error is rethrown. A file that cannot be
 * restored is logged and never hides the original failure.
 */
export async function writeOrRestore(
  writer: OutputWriter,
  logger: Logger,
  writes: readonly PlannedWrite[],
): Promise<Result<void, WriteRefusal>> {
  const written: Written[] = [];
  let result: Result<void, WriteRefusal>;
  try {
    result = await writeEach(writer, writes, written);
  } catch (error: unknown) {
    await restore(writer, logger, written);
    throw error;
  }
  if (!result.ok) await restore(writer, logger, written);
  return result;
}
