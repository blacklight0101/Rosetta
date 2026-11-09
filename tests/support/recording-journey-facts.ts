import type {
  JourneyFactsStore,
  RunEndFacts as EndFacts,
} from '../../src/application/ports/journey-facts-store.js';
import type { EpochMs } from '../../src/domain/accounts/user.js';
import type { Run } from '../../src/domain/runs/run.js';

// P8-139, DEC-226: the journey facts the writers store, kept in memory in the order they were
// stored, and the writers that store nothing for the tests that do not look at the facts. The
// writers are required dependencies, so a composition root cannot leave one out.

/** The facts the writers stored, in the order they stored them. */
export class RecordingFacts implements JourneyFactsStore {
  readonly ends: [string, EndFacts][] = [];
  readonly questions: [string, readonly string[], number][] = [];
  readonly sources: [string, string][] = [];
  readonly briefs: [string, string, EpochMs][] = [];

  recordPlanSource(runId: string, sourceKey: string): Promise<void> {
    this.sources.push([runId, sourceKey]);
    return Promise.resolve();
  }

  recordEnd(runId: string, facts: EndFacts): Promise<void> {
    this.ends.push([runId, facts]);
    return Promise.resolve();
  }

  recordOpenQuestions(userId: string, runIds: readonly string[], count: number): Promise<void> {
    this.questions.push([userId, runIds, count]);
    return Promise.resolve();
  }

  recordBriefSaved(userId: string, projectId: string, savedAt: EpochMs): Promise<void> {
    this.briefs.push([userId, projectId, savedAt]);
    return Promise.resolve();
  }

  /** The run as its row reads after the plan sources stored here. */
  withPlanSource(run: Run): Run {
    const stored = this.sources.filter(([runId]) => runId === run.id).at(-1);
    return stored === undefined ? run : { ...run, planSourceKey: stored[1] };
  }
}

const done = (): Promise<void> => Promise.resolve();

/** A store of the journey facts that keeps nothing. */
export const noJourneyFacts: JourneyFactsStore = {
  recordPlanSource: done,
  recordEnd: done,
  recordOpenQuestions: done,
  recordBriefSaved: done,
};

/** The facts of a run's end, stored nowhere. */
export const noEndFacts = { record: done };

/** The open questions of a project, stored nowhere. */
export const noQuestionCounts = { refresh: done };
