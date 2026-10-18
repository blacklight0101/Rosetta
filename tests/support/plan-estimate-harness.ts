import { EstimatePlan } from '../../src/application/estimate/estimate-plan.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { Project } from '../../src/application/projects/project.js';
import { actorOf, type Actor } from '../../src/domain/accounts/actor.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { loadPlannerPrompt } from '../../src/infrastructure/prompts/prompt-files.js';
import { sampleAccount } from './account-fixtures.js';
import { estimatePrices } from './estimate-harness.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { seedPlanSource, type PlanSourceSeed } from './plan-source-seed.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import { sampleProject } from './project-fixtures.js';
import { understandSettings } from './understand-run-harness.js';

// RF-613: the plan estimate over memory adapters and the real card, answer and brief files in a
// memory folder, with a fixed price table (one priced OpenAI model; Ollama is free). The project
// plans with the given settings; the user, the clock and the server's caps are the memory defaults
// (run 0.50, user-day 1.00 and server-month 10.00 USD) unless the test changes them.

export interface PlanEstimateHarness {
  readonly estimate: EstimatePlan;
  readonly account: UserAccount;
  readonly actor: Actor;
  readonly project: Project;
  readonly usage: MemoryAccountUsage;
  readonly keys: MemoryProviderKeyRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly clock: FixedClock;
  /** Seeds (or re-seeds) the plan sources of the project. */
  seed(seed?: PlanSourceSeed): Promise<void>;
}

export interface PlanEstimateOptions {
  readonly settings?: ProjectSettings;
  readonly account?: Partial<UserAccount>;
  /** What to seed before the test starts; everything by default. Pass false to seed nothing. */
  readonly seed?: PlanSourceSeed | false;
}

/** The project settings with the planner on this provider and model; the other roles stay local. */
export function plannerSettings(
  planner: { readonly provider: string; readonly model: string },
  change: (settings: ProjectSettings) => ProjectSettings = (settings) => settings,
): ProjectSettings {
  return understandSettings((base) =>
    change({ ...base, roles: { ...base.roles, planner: { ...base.roles.planner, ...planner } } }),
  );
}

export async function createPlanEstimateHarness(
  options: PlanEstimateOptions = {},
): Promise<PlanEstimateHarness> {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const account = sampleAccount({ userName: 'plan.estimate', ...options.account });
  const users = new MemoryUserRepository();
  await users.insert(account);
  const project = sampleProject({
    userId: account.id,
    settings: options.settings ?? plannerSettings({ provider: 'ollama', model: 'gemma4:e4b' }),
  });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const [runs, files, masker] = [
    new MemoryRunIndex(),
    new MemoryOutputWriter(),
    new SecretMasker(),
  ];
  const briefs = new FilePlanningBriefStore({ writer: files, masker });
  const [usage, keys] = [new MemoryAccountUsage(), new MemoryProviderKeyRepository()];
  const serverSettings = new MemoryServerSettings({});
  const harness: PlanEstimateHarness = {
    ...{ account, project, usage, keys, serverSettings, clock },
    actor: actorOf(account),
    estimate: new EstimatePlan({
      ...{ projects, runs, briefs, users, serverSettings, usage, keys, clock },
      cards: new FileRunCards(files),
      answers: new FileAnswersFile({ writer: files, masker }),
      priceTable: estimatePrices,
      catalogue: () => Promise.resolve(shippedCatalogue),
      prompt: () => loadPlannerPrompt('prompts'),
    }),
    async seed(seed) {
      await seedPlanSource({ files, briefs, runs }, project, seed);
    },
  };
  if (options.seed !== false) await harness.seed(options.seed);
  return harness;
}
