import { EstimateDeepen } from '../application/estimate/deepen-estimate.js';
import type { Clock } from '../application/ports/clock.js';
import type { ScanResults } from '../application/ports/scan-results.js';
import type { RunQueue } from '../application/runs/run-queue.js';
import { resumeProblemCheck } from '../application/understand/resume-problem.js';
import { ResumeRun } from '../application/use-cases/resume-run.js';
import type { SubmitRun } from '../application/use-cases/submit-run.js';
import { ReadUnderstanding } from '../application/use-cases/read-understanding.js';
import { StartDeepen } from '../application/use-cases/start-deepen.js';
import type { ModelList } from '../application/models/model-list.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import { FileTaskResults } from '../infrastructure/cards/file-task-results.js';
import type { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import type { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import type { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import type { DeepenServices } from './web/deepen-routes.js';

// RF-006, RF-209: the use cases that go on from an ended understand run, behind the run routes:
// Resume (the same run, after a stop) and Deepen (a new linked run, after it completed).

export interface DeepenParts {
  readonly pool: DatabasePool;
  readonly projects: PgProjectRepository;
  readonly runs: PgRunIndex;
  readonly manifests: FileRunManifestStore;
  readonly scans: ScanResults;
  readonly submit: SubmitRun;
  readonly writer: NodeOutputWriter;
  readonly masker: TextMasker;
  readonly priceTable: PriceTable;
  readonly models: ModelList;
  readonly ollamaHost: string | undefined;
}

// RF-209
export function composeDeepen(parts: DeepenParts): DeepenServices {
  const { projects, runs, manifests, scans, ollamaHost } = parts;
  const taskResults = new FileTaskResults({ writer: parts.writer, masker: parts.masker });
  return {
    startDeepen: new StartDeepen({
      ...{ projects, runs, manifests, submit: parts.submit },
      ...(ollamaHost === undefined ? {} : { ollamaHost }),
    }),
    estimateDeepen: new EstimateDeepen({
      ...{ projects, runs, scans, priceTable: parts.priceTable, models: parts.models },
      taskResults,
      keys: new PgProviderKeyRepository(parts.pool),
    }),
    readUnderstanding: new ReadUnderstanding({ runs, scans, taskResults, manifests }),
  };
}

/** RF-006: Resume, with what would make the resumed run fail again found first. */
export function composeResume(
  parts: Pick<DeepenParts, 'projects' | 'runs' | 'manifests' | 'scans' | 'writer' | 'masker'> & {
    readonly queue: RunQueue;
    readonly clock: Clock;
    readonly ollamaHost: string | undefined;
  },
): ResumeRun {
  const { projects, runs, manifests, queue, clock, scans, ollamaHost } = parts;
  return new ResumeRun({
    ...{ projects, runs, manifests, queue, clock },
    problem: resumeProblemCheck({
      ...{ runs, scans },
      taskResults: new FileTaskResults({ writer: parts.writer, masker: parts.masker }),
    }),
    ...(ollamaHost === undefined ? {} : { ollamaHost }),
  });
}
