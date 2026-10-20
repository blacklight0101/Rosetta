import { join } from 'node:path';
import { z } from 'zod';
import { GetJourney } from '../../src/application/use-cases/get-journey.js';
import { GetPlanSource } from '../../src/application/use-cases/get-plan-source.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { readJson } from './understand-full-run.js';
import { createUnderstandHarness, type UnderstandHarness } from './understand-run-harness.js';

// RF-208, Q-43: a run over Catalog and Services in which Catalog fails and Services gives one
// Supported card, and what a retry of Catalog leaves: its cards, its claims and what the journey and
// Plan setup read from it.

export const retryAreas = ['Catalog', 'Services'];

const indexSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      area: z.string(),
      claimCounts: z.object({ Supported: z.number() }),
    }),
  ),
});

/** A scanned harness and its first run, in which Catalog failed and Services gave FEAT-001. */
export async function firstRunOf(
  dataDir: string,
  recording: string,
): Promise<{ readonly h: UnderstandHarness; readonly first: Run }> {
  const h = await createUnderstandHarness({
    ...{ dataDir, recording, verifierRecording: 'verifier-all-supported.json' },
  });
  await h.scan();
  const first = await h.understand({ areas: retryAreas });
  if (first.endState !== 'Completed' || first.failedAreas !== 1) {
    throw new Error('The first run was meant to complete with one failed area');
  }
  return { h, first };
}

/** The cards of the run (id, area, Supported claims), in card order. */
export async function cardsOfRun(
  h: UnderstandHarness,
  run: Run,
): Promise<readonly (string | number)[][]> {
  const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
  return index.cards.map((card) => [card.id, card.area, card.claimCounts.Supported]);
}

/** The reader task ids the fake reader was asked about from the `from`-th request on. */
export function readersAskedSince(h: UnderstandHarness, from: number): readonly string[] {
  return h.providers
    .requests()
    .slice(from)
    .map((request) => request.context.agentTaskId)
    .filter((id) => id.startsWith('reader-'));
}

interface ProjectReaders {
  readonly journey: () => ReturnType<GetJourney['execute']>;
  readonly planSource: () => ReturnType<GetPlanSource['execute']>;
}

/** The journey and Plan setup of the project, read from the files the runs left. */
export function readersOfProject(h: UnderstandHarness): ProjectReaders {
  const s = h.stores;
  const cards = new FileRunCards(s.writer);
  const owner = { userId: h.project.userId, role: 'user' } as const;
  const journey = new GetJourney({
    ...{ projects: s.projects, runs: s.runs, manifests: s.manifests, history: s.log },
    briefs: new FilePlanningBriefStore({ writer: s.writer, masker: s.masker }),
    ...{ cards, answers: new FileAnswersFile({ writer: s.writer, masker: s.masker }) },
    priorCards: new FilePriorCards(s.writer),
  });
  const source = new GetPlanSource({ projects: s.projects, runs: s.runs, cards });
  return {
    journey: () => journey.execute({ actor: owner, projectId: h.project.id }),
    planSource: () => source.execute({ actor: owner, projectId: h.project.id }),
  };
}
