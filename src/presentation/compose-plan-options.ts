import { fileURLToPath } from 'node:url';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { ScanResults } from '../application/ports/scan-results.js';
import { SuggestPlanOptions } from '../application/use-cases/suggest-plan-options.js';
import { FileRunCards } from '../infrastructure/cards/file-run-cards.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { loadCatalogue } from '../infrastructure/prompts/catalogue-files.js';
import { loadPlanOptionsPrompt } from '../infrastructure/prompts/prompt-files.js';
import { unrecordedSinks } from '../infrastructure/providers/unrecorded-sinks.js';
import { SystemTimeoutSignals } from '../infrastructure/system/system-timeout-signals.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';

// Architecture section 2 (composition root), RF-608, RF-609, ADR-003, ADR-007: the options of Plan
// setup. The planner's provider comes only from the provider factory; the cards of the newest
// understand run are read from the user's workspace and the code map of the newest scan from its
// run folder. The catalogue and the prompt are read for each call, so an edit to a catalogue file
// shows at once. This file is at the same depth in `src/` and in the built `dist/`, so `../../` is
// the repository root.
const promptsFolder = fileURLToPath(new URL('../../prompts/', import.meta.url));

export interface PlanOptionsParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly writer: OutputWriter;
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
}

// RF-608, RF-609
export function composePlanOptions(parts: PlanOptionsParts): SuggestPlanOptions {
  const { pool, logger, clock, writer, projects, runs, scans, providers } = parts;
  return new SuggestPlanOptions({
    ...{ projects, runs, scans, providers, logger },
    users: new PgUserRepository(pool),
    cards: new FileRunCards(writer),
    unrecorded: unrecordedSinks(),
    catalogue: () => loadCatalogue(promptsFolder),
    prompt: () => loadPlanOptionsPrompt(promptsFolder),
    ids: new TimestampIdGenerator(clock),
    signals: new SystemTimeoutSignals(),
  });
}
