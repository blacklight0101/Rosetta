import type { RunEndFacts } from '../application/journey/run-end-facts.js';
import { RunLifecycle } from '../application/runs/run-lifecycle.js';
import { StartParallelism } from '../application/runs/run-start-parallelism.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunEventHistory, RunEventSink } from '../application/ports/run-events.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import { FanOutSink } from '../infrastructure/events/fan-out-sink.js';
import { composeStartCaps } from './compose-start-caps.js';
import type { Clock } from '../application/ports/clock.js';
import type { KeySourceLookup } from '../application/ports/key-source-lookup.js';
import type { Logger } from '../application/ports/logger.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { ollamaHostOf } from './compose-understand.js';

// RF-003, RF-1006, RF-1106, architecture section 2 (composition root): the steps of a run beyond the
// index: the manifest, the event log with the live broadcaster, the start caps and (P8-139, DEC-226)
// the journey facts of its end; the parallelism of its start (P8-59).

/** What the lifecycle needs of the run parts (compose-runs.ts). */
export interface LifecycleParts {
  readonly pool: DatabasePool;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly keySources: KeySourceLookup;
  readonly ollamaUrl: string | undefined;
}

export function composeLifecycle(
  parts: LifecycleParts,
  stores: {
    readonly runs: RunIndex;
    readonly manifests: RunManifestStore;
    readonly log: RunEventSink & RunEventHistory;
    readonly broadcaster: RunEventSink;
    readonly projects: ProjectRepository;
  },
  endFacts: Pick<RunEndFacts, 'record'>,
): RunLifecycle {
  const { pool, clock, logger } = parts;
  const { runs, manifests, log, broadcaster, projects } = stores;
  return new RunLifecycle({
    ...{ runs, manifests, sink: new FanOutSink([log, broadcaster]), history: log },
    ...{ clock, logger, endFacts },
    // RF-1002, P8-59: the parallelism `run.started` records.
    parallelism: new StartParallelism({ projects }),
    startCaps: composeStartCaps(pool, projects, parts.keySources, ollamaHostOf(parts.ollamaUrl)),
  });
}
