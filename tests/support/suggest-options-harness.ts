import { fileURLToPath } from 'node:url';
import { SuggestPlanOptions } from '../../src/application/use-cases/suggest-plan-options.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { Project } from '../../src/application/projects/project.js';
import { actorOf, type Actor } from '../../src/domain/accounts/actor.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { loadCatalogue } from '../../src/infrastructure/prompts/catalogue-files.js';
import { loadPlanOptionsPrompt } from '../../src/infrastructure/prompts/prompt-files.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { sampleAccount } from './account-fixtures.js';
import { FixedScans, areaOf } from './estimate-harness.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { seedPlanSource, type PlanSourceSeed } from './plan-source-seed.js';
import { sampleProject } from './project-fixtures.js';
import { factoryHarness, settingsFor, type FactoryHarness } from './provider-factory-harness.js';
import { sampleRun } from './run-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-608, RF-609, ADR-007: the options of Plan setup over memory adapters, the real card files in a
// memory folder and the real guarded provider factory whose one adapter replays a recording. The
// project's planner is the fake provider unless the test says otherwise.

const promptsFolder = fileURLToPath(new URL('../../prompts', import.meta.url));

export interface SuggestOptionsHarness {
  readonly suggest: SuggestPlanOptions;
  readonly factory: FactoryHarness;
  readonly account: UserAccount;
  readonly actor: Actor;
  readonly project: Project;
}

export interface SuggestOptionsOptions {
  readonly recording: Recording;
  readonly settings?: ProjectSettings;
  readonly serverKeys?: { readonly openai?: string };
  /** What to seed; the plan cards and a finished scan by default. */
  readonly seed?: PlanSourceSeed;
  /** False seeds no finished scan run. */
  readonly scan?: boolean;
}

const fakePlanner = { planner: { provider: 'fake', model: 'fake-planner' } } as const;

export async function createSuggestOptionsHarness(
  options: SuggestOptionsOptions,
): Promise<SuggestOptionsHarness> {
  const factory = factoryHarness({
    recordings: { fake: options.recording },
    ...(options.serverKeys === undefined ? {} : { serverKeys: options.serverKeys }),
  });
  const account = sampleAccount({ userName: 'suggest.options' });
  const users = new MemoryUserRepository();
  await users.insert(account);
  const project = sampleProject({
    userId: account.id,
    settings: options.settings ?? settingsFor(fakePlanner),
  });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const [runs, files, masker] = [
    new MemoryRunIndex(),
    new MemoryOutputWriter(),
    new SecretMasker(),
  ];
  const briefs = new FilePlanningBriefStore({ writer: files, masker });
  await seedPlanSource({ files, briefs, runs }, project, { brief: false, ...options.seed });
  if (options.scan !== false) {
    const done = { queueState: 'Ended', endState: 'Completed' } as const;
    await runs.insert(
      sampleRun({ projectId: project.id, userId: account.id, stage: 'scan', ...done }),
    );
  }
  const suggest = new SuggestPlanOptions({
    ...{ projects, runs, users, ids: new SequenceIdGenerator(), logger: factory.logger },
    cards: new FileRunCards(files),
    scans: new FixedScans([areaOf('Orders', 1000)]),
    providers: factory.factory,
    unrecorded: factory.sinks,
    catalogue: () => loadCatalogue(promptsFolder),
    prompt: () => loadPlanOptionsPrompt(promptsFolder),
    signals: { after: () => new AbortController().signal },
  });
  return { suggest, factory, account, actor: actorOf(account), project };
}
