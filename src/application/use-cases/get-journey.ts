import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import { queuePositions } from '../../domain/runs/queue-rules.js';
import type { Journey } from '../journey/journey.js';
import { journeyOfFacts } from '../journey/journey-of-facts.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-615, RF-614, RF-1105, DEC-142, DEC-143, DEC-226: Get journey gives the journey strip the facts it
// is drawn from: the understand run the package is written from, its open questions, whether a brief
// is saved, the newest plan run written from that run and the package. The facts are stored on the
// run rows and the project row by the code that knows them (P8-139), so the read opens no run file:
// the project, its runs, its journey record and, when one of its runs waits, the queue.
// `journeyOfFacts` turns them into the journey. Another user's project or run, a run of another
// project and a run of any other stage are not found.

export interface GetJourneyDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'list' | 'listQueued'>;
  /** RF-1021: the journey record of the project; without it no amount is reported. */
  readonly journeys?: Pick<JourneyRecords, 'find'> | undefined;
}

export interface GetJourneyRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** The id of an understand or a plan run of the project; none means the newest of the project. */
  readonly runId?: string | undefined;
}

type NotFound = typeof ERROR_CODES.notFound;

export class GetJourney {
  private readonly deps: GetJourneyDependencies;

  constructor(deps: GetJourneyDependencies) {
    this.deps = deps;
  }

  // RF-615, RF-1105
  async execute(request: GetJourneyRequest): Promise<Result<Journey, NotFound>> {
    const { userId } = request.actor;
    const { projectId, runId } = request;
    const project = await this.deps.projects.find(userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const runs = await this.deps.runs.list(userId, projectId);
    const record = await this.deps.journeys?.find(userId, projectId);
    // EV-80: the queue is read only when a run of the project waits in it.
    const waits = runs.some((run) => run.queueState === 'Queued');
    const positions = waits ? queuePositions(await this.deps.runs.listQueued()) : new Map();
    const briefSavedAt = project.briefSavedAt ?? null;
    return journeyOfFacts({ runs, briefSavedAt, record, positions }, runId);
  }
}
