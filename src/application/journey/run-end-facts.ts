import type { Run } from '../../domain/runs/run.js';
import type { JourneyFactsStore } from '../ports/journey-facts-store.js';
import type { RunCards } from '../ports/run-cards.js';
import { supportedClaimsOf } from './journey-file-facts.js';
import type { OpenQuestionCounts } from './open-question-counts.js';

// P8-139, DEC-226, RF-615: what the end of a run knows of the journey: the code its `run.ended` said,
// the Supported claims of an understand run, and (the run's questions and cards are written by now)
// the open questions of its project's understand runs.

export interface RunEndFactsDependencies {
  readonly cards: RunCards;
  readonly facts: Pick<JourneyFactsStore, 'recordEnd'>;
  readonly counts: Pick<OpenQuestionCounts, 'refresh'>;
}

export class RunEndFacts {
  private readonly deps: RunEndFactsDependencies;

  constructor(deps: RunEndFactsDependencies) {
    this.deps = deps;
  }

  // RF-615
  async record(run: Run, endCode: string | null): Promise<void> {
    const supportedClaims = await supportedClaimsOf(this.deps.cards, run);
    await this.deps.facts.recordEnd(run.id, { endCode, supportedClaims });
    if (run.stage !== 'understand') return;
    await this.deps.counts.refresh({ userId: run.userId, projectId: run.projectId });
  }
}
