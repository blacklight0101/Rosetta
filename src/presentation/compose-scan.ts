import { RunScan } from '../application/use-cases/run-scan.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import type { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import type { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { FetchFunction } from '../infrastructure/github/github-http-client.js';
import { GitHubSnapshotFetcher } from '../infrastructure/github/github-snapshot-fetcher.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import type { LanguagePackRegistry } from '../infrastructure/scan/packs/pack-registry.js';
import type { ParseBudget } from '../infrastructure/scan/packs/parse-budget.js';
import { SnapshotScanPipeline } from '../infrastructure/scan/scan-pipeline.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import { createUploadStore } from './compose-uploads.js';

// The scan stage of the runs composition (compose-runs.ts): the snapshot fetcher and the executor
// that fetches, scans and records. Moved out of compose-runs.ts when the start caps (P3-91) needed
// its room; the wiring is unchanged.

export interface ScanParts {
  readonly executor: RunScan;
  readonly fetcher: GitHubSnapshotFetcher;
}

/** What the scan stage is built from: the shared run settings and the run's stores. */
export interface ScanInputs {
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly dataDir: string;
  readonly githubToken: string | undefined;
  readonly fetch?: FetchFunction;
  readonly packs: LanguagePackRegistry;
  readonly parseBudget: ParseBudget;
  readonly writer: NodeOutputWriter;
  readonly manifests: FileRunManifestStore;
  readonly projects: PgProjectRepository;
}

/** The scan stage: the snapshot fetcher and the executor that fetches, scans and records. */
export function composeScan(parts: ScanInputs): ScanParts {
  const { logger, clock, masker, dataDir, projects, manifests } = parts;
  const fetcher = new GitHubSnapshotFetcher({
    ...{ dataDir, clock, logger, idGenerator: new TimestampIdGenerator(clock) },
    githubToken: parts.githubToken,
    ...(parts.fetch === undefined ? {} : { fetch: parts.fetch }),
  });
  const pipeline = new SnapshotScanPipeline({
    ...{
      writer: parts.writer,
      masker,
      logger,
      packs: parts.packs,
      parseBudget: parts.parseBudget,
    },
  });
  return {
    fetcher,
    executor: new RunScan({
      ...{ fetcher, projects, pipeline, manifests, clock, logger },
      uploads: createUploadStore(dataDir),
    }),
  };
}
