import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Journey } from '../journey/journey.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunEventHistory } from '../ports/run-events.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';

// RF-615: skeleton, filled in by the feature commit.

export interface GetJourneyDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'find' | 'list'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly history: Pick<RunEventHistory, 'read' | 'lastSeq'>;
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly cards: RunCards;
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
  readonly priorCards: Pick<PriorCards, 'cardsOf'>;
}

export class GetJourney {
  readonly deps: GetJourneyDependencies;

  constructor(deps: GetJourneyDependencies) {
    this.deps = deps;
  }

  execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
    readonly runId?: string | undefined;
  }): Promise<Result<Journey, typeof ERROR_CODES.notFound>> {
    if (request.projectId === '') return Promise.resolve(err(ERROR_CODES.notFound));
    return Promise.resolve(
      ok({ source: null, scanRunId: null, briefSaved: false, plan: null, handoff: null }),
    );
  }
}
