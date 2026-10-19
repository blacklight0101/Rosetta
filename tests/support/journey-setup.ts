import type { RunManifestStore } from '../../src/application/ports/run-manifest-store.js';
import type { Project } from '../../src/application/projects/project.js';
import { GetJourney } from '../../src/application/use-cases/get-journey.js';
import type { Run } from '../../src/domain/runs/run.js';
import { actorOf } from '../../src/domain/accounts/actor.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../src/infrastructure/events/memory-event-sink.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { JourneyStores } from './journey-seed.js';
import { sampleAccount } from './account-fixtures.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { seedPlanSource } from './plan-source-seed.js';
import { sampleProject } from './project-fixtures.js';

// RF-615: the journey use case over memory adapters, with the understand run, the brief and the
// questions that `seedPlanSource` seeds; `journey-seed.ts` adds the plan and scan runs.

export const account = sampleAccount({ userName: 'journey.facts' });
export const actor = actorOf(account);
/** When `seedPlanSource` saves its brief. */
export const briefSavedAt = Date.parse('2026-10-12T09:30:00.000Z');
export const hour = 3_600_000;
/** The folder names of the understand run `seedPlanSource` seeds by default and of an older one. */
export const sourceKey = '20261012-090000-understand';
export const olderKey = '20261010-090000-understand';

export interface JourneyWorld {
  readonly project: Project;
  readonly parts: JourneyStores;
  readonly seed: (given?: Parameters<typeof seedPlanSource>[2]) => Promise<Run | undefined>;
  readonly journey: GetJourney;
  readonly priorCards: FilePriorCards;
}

export async function setup(readManifests?: Pick<RunManifestStore, 'read'>): Promise<JourneyWorld> {
  const project = sampleProject({ userId: account.id });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const files = new MemoryOutputWriter();
  const masker = new SecretMasker();
  const parts = {
    runs: new MemoryRunIndex(),
    manifests: new MemoryRunManifestStore(),
    events: new MemoryEventSink(),
  };
  const briefs = new FilePlanningBriefStore({ writer: files, masker });
  const priorCards = new FilePriorCards(files);
  const seed = (given: Parameters<typeof seedPlanSource>[2] = {}) =>
    seedPlanSource({ files, briefs, runs: parts.runs }, project, given);
  const journey = new GetJourney({
    projects,
    runs: parts.runs,
    manifests: readManifests ?? parts.manifests,
    history: parts.events,
    briefs,
    cards: new FileRunCards(files),
    answers: new FileAnswersFile({ writer: files, masker }),
    priorCards,
  });
  return { project, parts, seed, journey, priorCards };
}
