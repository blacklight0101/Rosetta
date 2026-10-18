import { fileURLToPath } from 'node:url';
import type { Logger } from '../../src/application/ports/logger.js';
import type { ProviderSetFactory } from '../../src/application/ports/provider-set-factory.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { SuggestPlanOptions } from '../../src/application/use-cases/suggest-plan-options.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { loadCatalogue } from '../../src/infrastructure/prompts/catalogue-files.js';
import { loadPlanOptionsPrompt } from '../../src/infrastructure/prompts/prompt-files.js';
import { unrecordedSinks } from '../../src/infrastructure/providers/unrecorded-sinks.js';
import { FakeTimeoutSignals } from './fake-timeout-signals.js';
import { FixedScans, areaOf } from './estimate-harness.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-608, RF-609: the options of Plan setup in the test server, over the memory projects and runs,
// the card files of the test server's workspace and the same guarded factory as the provider test
// (fake adapters). A test seeds the understand run, its cards and a scan the way the plan estimate
// tests do (`seedPlanSource`), and the recording of the planner's provider name is its answer.

const promptsFolder = fileURLToPath(new URL('../../prompts', import.meta.url));

export interface PlanOptionsParts {
  readonly projects: MemoryProjectRepository;
  readonly runs: RunIndex;
  readonly users: UserRepository;
  readonly files: MemoryOutputWriter;
  readonly providers: ProviderSetFactory;
  readonly logger: Logger;
}

export function planOptionsService(parts: PlanOptionsParts): SuggestPlanOptions {
  const { projects, runs, users, files, providers, logger } = parts;
  return new SuggestPlanOptions({
    ...{ projects, runs, users, providers, logger },
    cards: new FileRunCards(files),
    scans: new FixedScans([areaOf('Orders', 1000)]),
    callSinks: () => unrecordedSinks(),
    catalogue: () => loadCatalogue(promptsFolder),
    prompt: () => loadPlanOptionsPrompt(promptsFolder),
    ids: new SequenceIdGenerator(),
    signals: new FakeTimeoutSignals(),
  });
}
