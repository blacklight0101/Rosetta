import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import type { Run } from '../../domain/runs/run.js';
import {
  projectQuestions,
  type ProjectQuestionDependencies,
} from '../answers/project-questions.js';
import { parentNamedIn } from '../answers/run-family.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { StoredRunFacts } from '../ports/journey-facts-store.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunEventHistory } from '../ports/run-events.js';
import { scopeOf } from '../runs/run-scope.js';
import { waitsForAnswer } from '../use-cases/question-states.js';
import { endCodeOf } from './journey-lookup.js';

// P8-139, DEC-226, RF-615, RF-646: the journey facts as the run files hold them. The writers use the
// same derivation as the read used before the facts were stored (the Supported claims of the cards,
// the open questions of the run's family), and the backfill reads every fact of a run that existed
// before migration 0024 from its files once.

export interface JourneyFileDependencies extends ProjectQuestionDependencies {
  readonly history: Pick<RunEventHistory, 'read' | 'lastSeq'>;
  readonly cards: RunCards;
}

/** Called for a fact whose file is missing, torn or not the run's; the fact stays null. */
export type FactProblem = (fact: string, error: unknown) => Promise<void>;

const isUnderstand = (run: Run): boolean => run.stage === 'understand';

/** RF-615, P3-121: the Supported claims of an understand run that ended `Completed` or `CapReached`. */
export async function supportedClaimsOf(cards: RunCards, run: Run): Promise<number | null> {
  const counted = run.endState === 'Completed' || run.endState === 'CapReached';
  if (!isUnderstand(run) || !counted) return null;
  const kept = supportedCards(await cards.cardsOf(scopeOf(run)));
  return kept.reduce((sum, card) => sum + card.claims.length, 0);
}

/**
 * RF-615, RF-646, DEC-154: the questions of each family of the project's understand runs that wait for
 * an answer, by the id of every run of the family (the same number on each).
 */
export async function openQuestionCounts(
  deps: ProjectQuestionDependencies,
  runs: readonly Run[],
): Promise<ReadonlyMap<string, number>> {
  const counts = new Map<string, number>();
  for (const run of runs.filter(isUnderstand)) {
    if (counts.has(run.id)) continue;
    const { questions, family } = await projectQuestions(deps, run);
    const open = questions.filter(waitsForAnswer).length;
    for (const member of [run, ...family.runs]) counts.set(member.id, open);
  }
  return counts;
}

/** The manifest of the run; a manifest of another run is not the run's (a foreign file). */
async function ownManifest(deps: JourneyFileDependencies, run: Run): Promise<RunManifest> {
  const manifest = await deps.manifests.read(scopeOf(run));
  if (manifest === undefined)
    throw new RosettaError(ERROR_CODES.runManifestFailed, 'The run has no manifest.');
  if (manifest.runId !== run.runKey)
    throw new RosettaError(ERROR_CODES.runManifestFailed, 'The manifest names another run.');
  return manifest;
}

/** RF-614: the source a plan run's manifest names, or the run its queued options name. */
function planSourceIn(manifest: RunManifest, projectRuns: readonly Run[]): string | null {
  if (manifest.sourceRunId !== null) return manifest.sourceRunId;
  const named = manifest.options['sourceRunId'];
  return projectRuns.find((each) => each.id === named)?.runKey ?? null;
}

/** Runs a reader of one fact; a reader that fails reports the fact and leaves it null. */
async function attempt<T>(fact: string, problem: FactProblem, read: () => Promise<T | null>) {
  try {
    return await read();
  } catch (error) {
    await problem(fact, error);
    return null;
  }
}

/**
 * DEC-226: the facts of one run from its files, but its open questions (they belong to its family,
 * see `openQuestionCounts`). Each fact is read on its own, so one bad file costs only its fact.
 */
export async function runFileFacts(
  deps: JourneyFileDependencies,
  run: Run,
  projectRuns: readonly Run[],
  problem: FactProblem,
): Promise<Omit<StoredRunFacts, 'openQuestions'>> {
  const manifest = await attempt('manifest', problem, () => ownManifest(deps, run));
  const plan = run.stage === 'plan';
  return {
    deepenParentId: isUnderstand(run) ? (parentNamedIn(manifest ?? undefined) ?? null) : null,
    planSourceKey: plan && manifest !== null ? planSourceIn(manifest, projectRuns) : null,
    endCode: await attempt('endCode', problem, () => endCodeOf(deps.history, run)),
    supportedClaims: await attempt('supportedClaims', problem, () =>
      supportedClaimsOf(deps.cards, run),
    ),
  };
}
