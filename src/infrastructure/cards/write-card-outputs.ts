import type { CardChanges } from '../../application/understand/card-changes.js';
import type { Logger } from '../../application/ports/logger.js';
import type { OutputWriter, WriteRefusal } from '../../application/ports/output-writer.js';
import type { AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Card } from '../../domain/cards/card.js';
import type { Overview } from '../../domain/overview/overview.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { writeRefusal } from '../files/workspace-guard.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { serialiseCardIndex } from './card-index.js';
import { renderCoverage, serialiseCoverage } from './coverage-files.js';
import { renderDataModel } from './data-model-markdown.js';
import { cardPath, renderCardFile } from './card-markdown.js';
import type { PermalinkSource } from './citation-link.js';
import { renderOverview, renderOverviewJson } from './overview-markdown.js';
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
  /** Cards merged into another since the last write (RF-250): their files are removed. */
  readonly mergedAway?: readonly Pick<Card, 'id' | 'type'>[];
  /** RF-241: the new and changed cards of a re-run with answers. */
  readonly changes?: CardChanges;
  /** RF-264: the overview of the run; written once the run has one. */
  readonly overview?: Overview | undefined;
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

/**
 * Removes the file of each card that was merged into another (RF-250) and `data-model.md` when
 * the cards hold no entity any more (RF-262), so a re-run leaves no stale file; a refusal is
 * returned.
 */
async function removeStale(
  writer: OutputWriter,
  target: CardOutputTarget,
  paths: readonly string[],
): Promise<Result<void, WriteRefusal>> {
  for (const path of paths) {
    const file = { userId: target.userId, path: `${target.folder}/${path}` };
    const removed = await writer.remove(file);
    if (!removed.ok) return removed;
  }
  return ok(undefined);
}

// RF-264: `overview.md` and `overview.json`, once the run has an overview.
function overviewFiles(overview: Overview | undefined, masker: TextMasker): PlannedFile[] {
  if (overview === undefined) return [];
  return [
    { path: 'overview.md', text: renderOverview(overview, masker) },
    { path: 'overview.json', text: renderOverviewJson(overview, masker) },
  ];
}

/**
 * Writes `cards/<TYPE>/<ID>.md` for each card, then `cards/index.json` and `spec.md`, and removes
 * the files of the cards that were merged into another (RF-250).
 */
export async function writeCardOutputs(
  writer: OutputWriter,
  target: CardOutputTarget,
  input: CardOutputInput,
): Promise<Result<void, WriteRefusal>> {
  const { cards, source, masker, logger, changes } = input;
  const { areasWithoutCards = [], mergedAway = [], overview } = input;
  const files: PlannedFile[] = [
    ...cards.map((card) => ({
      path: cardPath(card),
      text: renderCardFile(card, source, masker, cards),
    })),
    { path: 'cards/index.json', text: serialiseCardIndex(cards, masker) },
    ...overviewFiles(overview, masker),
    {
      path: 'spec.md',
      text: renderSpec(cards, source, masker, { areasWithoutCards, changes, overview }),
    },
    ...(cards.some((card) => card.type === 'ENT')
      ? [{ path: 'data-model.md', text: renderDataModel(cards, source, masker) }]
      : []),
  ];
  const written = await writeAll(writer, target, files, logger);
  const stale = [
    ...mergedAway.map(cardPath),
    ...(cards.some((card) => card.type === 'ENT') ? [] : ['data-model.md']),
  ];
  return written.ok ? removeStale(writer, target, stale) : written;
}

export interface CoverageOutputInput {
  /** The coverage of every ended task, in area order. */
  readonly coverage: readonly AreaCoverage[];
  readonly masker: TextMasker;
  readonly logger: Logger;
}

// RF-230: `coverage.json` and `coverage.md`, both made and masked before the first write.
export async function writeCoverageOutputs(
  writer: OutputWriter,
  target: CardOutputTarget,
  input: CoverageOutputInput,
): Promise<Result<void, WriteRefusal>> {
  const { coverage, masker, logger } = input;
  const files: PlannedFile[] = [
    { path: 'coverage.json', text: serialiseCoverage(coverage, masker) },
    { path: 'coverage.md', text: renderCoverage(coverage, masker) },
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
