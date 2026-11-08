import { backfillJourneyFacts } from '../application/journey/journey-facts-backfill.js';
import { OpenQuestionCounts } from '../application/journey/open-question-counts.js';
import { RunEndFacts } from '../application/journey/run-end-facts.js';
import type { Logger } from '../application/ports/logger.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunEventHistory } from '../application/ports/run-events.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { ScheduledJob } from '../application/ports/scheduler.js';
import { GetJourney } from '../application/use-cases/get-journey.js';
import { FileAnswersFile } from '../infrastructure/cards/answers-file.js';
import { PgJourneyFacts } from '../infrastructure/db/pg-journey-facts.js';
import { PgJourneyRecords } from '../infrastructure/db/pg-journey-records.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { keptPriorCards, keptRunCards } from './kept-card-readers.js';

// RF-615, DEC-226, architecture section 2 (composition root): the journey read over the stored facts
// (the project and run rows, the journey record and the queue), the writers of the facts that need
// the run files (the open questions of a project, the end of a run) and the backfill of the rows
// that existed before the facts were stored (P8-139).

export interface JourneyFileParts {
  readonly pool: DatabasePool;
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly logger: Logger;
}

// RF-615
export function composeJourney(parts: {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'list' | 'listQueued'>;
  readonly pool: DatabasePool;
}): GetJourney {
  const { projects, runs, pool } = parts;
  return new GetJourney({ projects, runs, journeys: new PgJourneyRecords(pool) });
}

function questionParts(parts: JourneyFileParts) {
  const { writer, masker, runs } = parts;
  return {
    runs,
    manifests: new FileRunManifestStore({ writer, masker }),
    answers: new FileAnswersFile({ writer, masker }),
    priorCards: keptPriorCards(writer),
  };
}

/**
 * RF-646: stores the open questions of a project after anything that changes them. One instance
 * serves every path (compose-runs.ts hands it to the history), so its refreshes of a project run in order.
 */
export function composeQuestionCounts(parts: JourneyFileParts): OpenQuestionCounts {
  return new OpenQuestionCounts({
    ...questionParts(parts),
    facts: new PgJourneyFacts(parts.pool),
    logger: parts.logger,
  });
}

/** RF-615: stores what the end of a run knows, and the open questions through `counts`. */
export function composeRunEndFacts(
  parts: JourneyFileParts,
  counts: OpenQuestionCounts,
): RunEndFacts {
  return new RunEndFacts({
    cards: keptRunCards(parts.writer),
    facts: new PgJourneyFacts(parts.pool),
    counts,
  });
}

/** DEC-226: the backfill of the rows from before migration 0024, as a scheduled job. */
export function composeJourneyBackfill(
  parts: JourneyFileParts & { readonly history: Pick<RunEventHistory, 'read' | 'lastSeq'> },
): ScheduledJob {
  const { writer, masker } = parts;
  return () =>
    backfillJourneyFacts({
      ...questionParts(parts),
      ...{ history: parts.history, cards: keptRunCards(writer), logger: parts.logger },
      briefs: new FilePlanningBriefStore({ writer, masker }),
      pending: new PgJourneyFacts(parts.pool),
    });
}
