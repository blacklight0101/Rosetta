import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { isBriefOutOfDate } from '../../domain/planning/planning-brief.js';
import type { Run } from '../../domain/runs/run.js';
import type { Journey, JourneyHandoff, JourneyRun, JourneySource } from '../journey/journey.js';
import { endCodeOf, planSourceKey } from '../journey/journey-lookup.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunEventHistory } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';
import { waitsForAnswer, withStates } from './question-states.js';

// RF-615, RF-614, RF-1105, DEC-142, DEC-143: Get journey gives the journey strip the facts it is drawn
// from: the understand run the package is written from, its open questions, whether a brief is
// saved, the newest plan run written from that run and the package. Nothing is stored; the facts
// come from the run index of the user, the manifests, the saved brief and the end of each run.
// The page may be about an understand run, a plan run (its source is the run its manifest names)
// or none (the newest completed understand run of the project, else its newest one). Another
// user's project or run, a run of another project and a run of any other stage are not found.

export interface GetJourneyDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly history: Pick<RunEventHistory, 'read' | 'lastSeq'>;
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly cards: RunCards;
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
  readonly priorCards: PriorCards;
}

export interface GetJourneyRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** The id of an understand or a plan run of the project; none means the newest of the project. */
  readonly runId?: string | undefined;
}

type NotFound = typeof ERROR_CODES.notFound;
/** The understand run each plan run was written from, by the id of the plan run. */
type PlanSources = ReadonlyMap<string, string | null>;

const isUnderstand = (run: Run): boolean => run.stage === 'understand';
const isCompleted = (run: Run): boolean => run.endState === 'Completed';
const isJourneyRun = (run: Run): boolean => isUnderstand(run) || run.stage === 'plan';
const startOf = (run: Run): number => run.startedAt ?? run.queuedAt;

/** The newest completed understand run of the project, else its newest understand run. */
const newestSource = (list: readonly Run[]): Run | undefined =>
  list.find((run) => isUnderstand(run) && isCompleted(run)) ?? list.find(isUnderstand);

/** The understand run the journey is about: the named one, the one a named plan run came from, or the newest. */
function chooseSource(list: readonly Run[], named: Run | undefined, sources: PlanSources) {
  if (named !== undefined && isUnderstand(named)) return named;
  const key = named === undefined ? undefined : sources.get(named.id);
  const written = key === undefined ? undefined : list.find((run) => run.runKey === key);
  return written !== undefined && isUnderstand(written) ? written : newestSource(list);
}

/**
 * Out of date when the brief was saved after the package began, when it was written from another
 * understand run, or when this run ended after it began (DEC-143 Q-C).
 */
function handoffOf(
  list: readonly Run[],
  source: Run,
  written: { readonly run: Run; readonly gaps: boolean },
  parts: { readonly briefSavedAt: string | undefined; readonly sources: PlanSources },
): JourneyHandoff {
  const { briefSavedAt, sources } = parts;
  const from = sources.get(written.run.id) ?? null;
  const briefChanged = briefSavedAt !== undefined && isBriefOutOfDate(briefSavedAt, list);
  const otherSource = from !== null && from !== source.runKey;
  const sourceChanged = source.endedAt !== null && source.endedAt > startOf(written.run);
  return {
    ...{ runId: written.run.id, runKey: written.run.runKey },
    ...{ outOfDate: briefChanged || otherSource || sourceChanged, gaps: written.gaps },
  };
}

export class GetJourney {
  private readonly deps: GetJourneyDependencies;

  constructor(deps: GetJourneyDependencies) {
    this.deps = deps;
  }

  // RF-615, RF-1105
  async execute(request: GetJourneyRequest): Promise<Result<Journey, NotFound>> {
    const { userId } = request.actor;
    const { projectId, runId } = request;
    if ((await this.deps.projects.find(userId, projectId)) === undefined) {
      return err(ERROR_CODES.notFound);
    }
    const list = await this.deps.runs.list(userId, projectId);
    const named = list.find((run) => run.id === runId);
    if (runId !== undefined && (named === undefined || !isJourneyRun(named))) {
      return err(ERROR_CODES.notFound);
    }
    const sources = await this.sourcesOfPlanRuns(list);
    const brief = await this.deps.briefs.read({ userId, projectId });
    const scan = list.find((run) => run.stage === 'scan' && isCompleted(run));
    const base = { scanRunId: scan?.id ?? null, briefSaved: brief !== undefined };
    const source = chooseSource(list, named, sources);
    if (source === undefined) return ok({ ...base, source: null, plan: null, handoff: null });
    const plan = list.find((run) => run.stage === 'plan' && sources.get(run.id) === source.runKey);
    return ok({
      ...base,
      source: await this.sourceFacts(source),
      plan: plan === undefined ? null : await this.runFacts(plan),
      handoff: await this.handoffFor(list, source, { briefSavedAt: brief?.savedAt, sources }),
    });
  }

  /**
   * The package is the newest plan run of the project that wrote one: a run that ended `Completed`,
   * or one that ended RST-1806 after writing the package with gaps (RF-627, Q-44).
   */
  private async handoffFor(
    list: readonly Run[],
    source: Run,
    parts: { readonly briefSavedAt: string | undefined; readonly sources: PlanSources },
  ): Promise<JourneyHandoff | null> {
    for (const run of list.filter((each) => each.stage === 'plan')) {
      if (isCompleted(run)) return handoffOf(list, source, { run, gaps: false }, parts);
      if (run.endState !== 'Failed') continue;
      const code = await endCodeOf(this.deps.history, run);
      if (code === ERROR_CODES.planCoverageGap) {
        return handoffOf(list, source, { run, gaps: true }, parts);
      }
    }
    return null;
  }

  private async sourcesOfPlanRuns(list: readonly Run[]): Promise<PlanSources> {
    const plans = list.filter((run) => run.stage === 'plan');
    const keys = await Promise.all(plans.map((run) => planSourceKey(this.deps.manifests, run)));
    return new Map(plans.map((run, index) => [run.id, keys[index] ?? null]));
  }

  private async runFacts(run: Run): Promise<JourneyRun> {
    return {
      ...{ id: run.id, runKey: run.runKey, queueState: run.queueState, endState: run.endState },
      ...{ endedAt: run.endedAt, costMicros: run.totals.costMicros },
      errorCode: await endCodeOf(this.deps.history, run),
    };
  }

  /** The run, and for a run that ended `Completed` its Supported claims and its open questions. */
  private async sourceFacts(run: Run): Promise<JourneySource> {
    const facts = await this.runFacts(run);
    if (!isCompleted(run)) return { ...facts, supportedClaims: 0, openQuestions: 0 };
    const project = { userId: run.userId, projectId: run.projectId };
    const cards = supportedCards(await this.deps.cards.cardsOf(scopeOf(run)));
    const asked = await this.deps.answers.questionsOf(project, run.runKey);
    const stated = await withStates(this.deps.priorCards, project, run.runKey, asked);
    return {
      ...facts,
      supportedClaims: cards.reduce((sum, card) => sum + card.claims.length, 0),
      openQuestions: stated.filter(waitsForAnswer).length,
    };
  }
}
