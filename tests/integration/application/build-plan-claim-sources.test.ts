import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { plain } from '../../support/plan-method-harness.js';
import { draftTask } from '../../support/task-card-fixtures.js';

// P8-02, RF-604, RF-607, ADR-013, EV-83: recorded answers shaped like the two plan runs of the
// evaluation of 2026-11-02, with synthetic names only. The first wrote claim ids in `sources`
// (`FEAT-001.c1`) where card ids belong, so every requirement and every card was left out and the
// run failed RST-1803; the second named requirements whose sources no card supports, so the task
// cards that named only them were left out. A claim id now counts as its card, and an answer with
// no usable source gets one repair round, shown what was left out and why, before RST-1803.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;
const sentinel = 'sentinel-title-0883';

const reply = (text: string) => ({
  retried: [],
  response: { text, toolCalls: [], usage, finishReason: 'stop' as const },
});

const requirement = (title: string, sources: readonly string[]) => ({
  ...{ title, statement: `${title} works as the legacy one did.`, sources },
});

const answer = (requirements: readonly object[], tasks: readonly object[]) =>
  JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements,
    phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
    tasks,
    risks: [{ text: 'The shipping rule is read twice.', sources: ['BR-001.c1'] }],
    entities: [{ legacy: 'Order', target: 'Order', notes: '', sources: ['ENT-001.c1'] }],
  });

/** Haiku AM plan try 1, in shape: every source is a claim id. */
const claimIds = answer(
  [
    requirement('Place an order', ['FEAT-001.c1', 'ENT-001.c1']),
    requirement('Free shipping', ['BR-001.c1']),
  ],
  [
    draftTask({ title: 'Orders', requirements: [1] }),
    draftTask({ title: 'Ship', requirements: [2] }),
  ],
);

/** Haiku AM plan try 2, in shape: card ids. */
const cardIds = answer(
  [
    requirement('Place an order', ['FEAT-001', 'ENT-001']),
    requirement('Free shipping', ['BR-001']),
  ],
  [
    draftTask({ title: 'Orders', requirements: [1] }),
    draftTask({ title: 'Ship', requirements: [2] }),
  ],
);

/** No source names a supported card, as a card or as a claim. */
const unsourced = answer(
  [requirement(sentinel, ['SCRN-404.c3', 'NOPE-001'])],
  [draftTask({ title: 'Orders', requirements: [1] })],
);

/** Ollama eShop plan try 1, in shape: some requirements kept, the cards that name only the others not. */
const someUnsourced = answer(
  [
    requirement('Place an order', ['FEAT-001']),
    requirement(sentinel, ['SCRN-404']),
    requirement('Export orders', ['XYZ-009']),
  ],
  [
    draftTask({ title: 'Orders', requirements: [2] }),
    draftTask({ title: 'Screens', requirements: [2] }),
    draftTask({ title: 'Export', requirements: [3] }),
  ],
);

/** One card left without a requirement while the others keep theirs. */
const oneOrphan = answer(
  [requirement('Place an order', ['FEAT-001']), requirement(sentinel, ['SCRN-404'])],
  [
    draftTask({ title: 'Orders', requirements: [1] }),
    draftTask({ title: 'Screens', requirements: [2] }),
  ],
);

const repaired = answer(
  [
    requirement('Place an order', ['FEAT-001']),
    requirement('Show the order', ['ENT-001']),
    requirement('Export orders', ['BR-001']),
  ],
  [
    draftTask({ title: 'Orders', requirements: [1] }),
    draftTask({ title: 'Screens', requirements: [2] }),
    draftTask({ title: 'Export', requirements: [3] }),
  ],
);

let dataDir = '';
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-claims-'));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned(...answers: string[]) {
  const recording = recordingOf(
    ...[...answers, 'No PRD.', 'No data model.', 'No flows.'].map(reply),
  );
  const h = await createPlanHarness(dataDir, recording);
  await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.saveBrief({
    architecture: { style: 'layered' },
    migration: 'strangler-fig',
    principles: ['sdd'],
  });
  const run = await h.plan();
  return { h, run };
}

type Harness = Awaited<ReturnType<typeof planned>>['h'];

const planRequests = (h: Harness) =>
  h.providers.requests().filter((each) => each.context.agentTaskId === 'planner-package');

const repairText = (h: Harness): string =>
  planRequests(h)[1]
    ?.messages.map((each) => each.content)
    .join('\n') ?? '';

describe('BuildPlan: claim ids in the sources of the answer (EV-83)', () => {
  it('P8-02 RF-604 the Haiku AM try-1 answer keeps every requirement and card, with no repair', async () => {
    const { h, run } = await planned(claimIds);

    expect(run.endState).not.toBe('Failed');
    expect(planRequests(h)).toHaveLength(1);
    const files = await h.handoffOf(run);
    const requirements = plain(files['requirements.md']);
    expect(requirements).toContain('Place an order');
    expect(requirements).toContain('Free shipping');
    expect(requirements).toContain('FEAT-001');
    expect(requirements).not.toContain('FEAT-001.c1');
    const tasks = plain(files['tasks.md']);
    expect(tasks).toContain('Orders');
    expect(tasks).toContain('Ship');
    const warned = h.s.logger.entries.map((entry) => entry.message).join('\n');
    expect(warned).not.toMatch(/\d+ requirement\(s\), \d+ entity mapping\(s\)/u);
  });

  it('P8-02 RF-604 the try-1 answer writes the same requirements as the try-2 answer with card ids', async () => {
    const first = await planned(claimIds);
    const one = plain((await first.h.handoffOf(first.run))['requirements.md']);
    await rm(dataDir, { recursive: true, force: true });
    dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-claims-'));
    const second = await planned(cardIds);
    const two = plain((await second.h.handoffOf(second.run))['requirements.md']);

    expect(one).toBe(two);
  });
});

describe('BuildPlan: one repair round before RST-1803 (EV-83)', () => {
  it('P8-02 RF-604 an answer with no usable source gets one repair round naming what was left out and why', async () => {
    const { h, run } = await planned(unsourced, cardIds);

    expect(run.endState).not.toBe('Failed');
    expect(planRequests(h)).toHaveLength(2);
    const text = repairText(h);
    expect(text).toContain('requirements, position 1: the field "sources".');
    expect(text).toContain('not claim ids such as ENT-002.c4');
    expect(text).toContain('tasks, position 1: the field "requirements".');
    expect(text).not.toContain(sentinel);
    expect(planRequests(h)[1]?.system).toBe(planRequests(h)[0]?.system);
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Orders');
  });

  it('P8-02 RF-604 the repair round is metered and its cost counts in the run', async () => {
    const { h } = await planned(unsourced, cardIds);

    const packageCalls = h.providers.ledger.entries.filter(
      (each) => each.agentTaskId === 'planner-package',
    );
    expect(packageCalls).toHaveLength(2);
  });

  it('P8-02 RST-1803 a repair answer still with no usable source fails the run, with no third call', async () => {
    const { h, run } = await planned(unsourced, unsourced);

    expect(run.endState).toBe('Failed');
    expect(planRequests(h)).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });
});

describe('BuildPlan: which answers the repair round is for (EV-83)', () => {
  it('P8-02 RF-607 the Ollama eShop try-1 shape: cards whose requirements were all left out get the repair', async () => {
    const { h, run } = await planned(someUnsourced, repaired);

    expect(planRequests(h)).toHaveLength(2);
    const text = repairText(h);
    expect(text).toContain('requirements, position 2: the field "sources".');
    expect(text).toContain('requirements, position 3: the field "sources".');
    expect(text).not.toContain('requirements, position 1:');
    for (const at of [1, 2, 3]) {
      expect(text).toContain(`tasks, position ${String(at)}: the field "requirements".`);
    }
    const tasks = plain((await h.handoffOf(run))['tasks.md']);
    for (const title of ['Orders', 'Screens', 'Export']) expect(tasks).toContain(title);
  });

  it('P8-02 RF-604 a repair answer that is worse than the first keeps the first', async () => {
    const { h, run } = await planned(someUnsourced, unsourced);

    expect(planRequests(h)).toHaveLength(2);
    // P9-06: the kept requirement is built by no card (its cards were left out), so the package is
    // written with it and the run ends RST-1806 instead of completing.
    expect(plain((await h.handoffOf(run))['requirements.md'])).toContain('Place an order');
    expect(plain((await h.handoffOf(run))['checks.md'])).toContain('Requirements built by no card');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });

  it('P8-02 RF-607 one card left without a requirement while others keep theirs gets no round', async () => {
    const { h } = await planned(oneOrphan);

    expect(planRequests(h)).toHaveLength(1);
  });

  it('P8-02 an answer whose sources all name supported cards gets no repair round', async () => {
    const { h } = await planned(cardIds);

    expect(planRequests(h)).toHaveLength(1);
  });
});
