import type { AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Card } from '../../domain/cards/card.js';
import { unionCoverage } from '../../domain/cards/coverage-union.js';
import type { Area } from '../../domain/code-map/area.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { isThirdPartyFile, thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import {
  readFirstPartyFiles,
  understandingMeasures,
  type UnderstandingMeasures,
} from '../../domain/deepen/understanding-measures.js';
import type { RoundSnapshot } from '../../domain/deepen/stop-rule.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { TaskResult } from '../ports/task-results.js';

// RF-209, RF-006: what a Deepen run holds between its rounds: the results of every task, those of
// the completed run it started from (copied, so that run stays as it was, RNF-004) and those of its
// own rounds. The cards, the claim statuses and the coverage are read from them, and they are the
// task results a resume of the Deepen reads back.

export interface DeepenState {
  readonly results: readonly TaskResult[];
}

/**
 * P7-02, DEC-194: the areas an understand run planned: the reader tasks of its manifest, or, for a
 * Deepen run, the plan its record carried on from the run it improved.
 */
export function plannedAreasOf(manifest: Pick<RunManifest, 'agentTasks' | 'deepen'>): string[] {
  const carried = manifest.deepen?.plannedAreas;
  if (carried !== undefined) return [...carried];
  return manifest.agentTasks.filter((task) => task.role === 'reader').map((task) => task.area);
}

/**
 * P7-02, DEC-194: how many areas of the plan still have no coverage entry after the Deepen's rounds
 * (first-party code only: a file-less or library area is nothing a Deepen would read).
 */
export function unreadPlannedAreas(
  state: DeepenState,
  planned: readonly string[] | undefined,
  codeMap: Pick<CodeMap, 'areas' | 'files'>,
): number {
  const started = new Set(coverageEntriesOf(state).map((entry) => entry.area));
  const library = thirdPartyAreaNames(codeMap);
  const files = new Map(codeMap.files.map((file) => [file.path, file]));
  const readable = (area: Pick<Area, 'files'>): boolean =>
    area.files.some((path) => {
      const file = files.get(path);
      return file !== undefined && file.estimatedTokens > 0 && !isThirdPartyFile(file);
    });
  return codeMap.areas.filter(
    (area) =>
      (planned ?? []).includes(area.name) &&
      !started.has(area.name) &&
      !library.has(area.name) &&
      readable(area),
  ).length;
}

export function cardsOf(state: DeepenState): readonly Card[] {
  return state.results.flatMap((result) => result.cards);
}

/** The state with each task's cards taken from `cards` (the same ids, new statuses). */
export function withCards(state: DeepenState, cards: readonly Card[]): DeepenState {
  return {
    results: state.results.map((result) => ({
      ...result,
      cards: cards.filter((card) => card.agentTaskId === result.agentTaskId),
    })),
  };
}

/** Every coverage entry, one per task; an area a round read again has several. */
export function coverageEntriesOf(state: DeepenState): readonly AreaCoverage[] {
  return state.results.map((result) => result.coverage);
}

/** RF-230: one coverage row per area of the run, with the lines every task read. */
export function coverageOf(
  state: DeepenState,
  codeMap: Pick<CodeMap, 'areas' | 'files'>,
): readonly AreaCoverage[] {
  return unionCoverage(coverageEntriesOf(state), codeMap.areas, codeMap.files);
}

// RF-231
export function measuresOf(
  state: DeepenState,
  codeMap: Pick<CodeMap, 'files'>,
): UnderstandingMeasures {
  const coverage = coverageEntriesOf(state);
  return understandingMeasures({ cards: cardsOf(state), coverage, files: codeMap.files });
}

/** RF-209: the `Supported` claims and the first-party files read, to tell what a round added. */
export function snapshotOf(state: DeepenState, codeMap: Pick<CodeMap, 'files'>): RoundSnapshot {
  const supported = cardsOf(state)
    .flatMap((card) => card.claims)
    .filter((claim) => claim.status === 'Supported')
    .map((claim) => claim.claimId);
  const coverage = coverageEntriesOf(state);
  return {
    supported: new Set(supported),
    filesRead: readFirstPartyFiles({ coverage, files: codeMap.files }),
  };
}
