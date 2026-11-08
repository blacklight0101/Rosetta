import type { RunEndFacts } from '../application/journey/run-end-facts.js';
import { RunLifecycle } from '../application/runs/run-lifecycle.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunEventHistory, RunEventSink } from '../application/ports/run-events.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import { FanOutSink } from '../infrastructure/events/fan-out-sink.js';
import { composeStartCaps } from './compose-start-caps.js';
import type { RunParts } from './compose-runs.js';
import { ollamaHostOf } from './compose-understand.js';

// RF-003, RF-1006, RF-1106, architecture section 2 (composition root): the steps of a run beyond the
// index: the manifest, the event log with the live broadcaster, the start caps and (P8-139, DEC-226)
// the journey facts of its end.

export function composeLifecycle(
  parts: RunParts,
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
    startCaps: composeStartCaps(pool, projects, parts.keySources, ollamaHostOf(parts.ollamaUrl)),
  });
}
