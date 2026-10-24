import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { isCardFile, manyCards } from '../../../support/large-plan-run.js';
import { createPlanEstimateHarness } from '../../../support/plan-estimate-harness.js';

// RF-604, RF-241, RF-1105 (P5-28): the cards of a run are read and parsed once per version of
// their files (size and modification time) and shared by the three reads of Plan setup. Counted
// through the memory folder, not timed.

async function seeded(count = 450) {
  const harness = await createPlanEstimateHarness({ seed: false });
  const run = await harness.seed({ cards: manyCards(count) });
  if (run === undefined) throw new Error('The run was not seeded.');
  const cardReads = (): number => harness.files.reads.filter(isCardFile).length;
  harness.files.reads.length = 0;
  return { files: harness.files, scope: scopeOf(run), run, cardReads };
}

const fileOfCard = (files: Map<string, string>, id: string): [string, string] => {
  const path = [...files.keys()].find((each) => each.endsWith(`/${id}.md`)) ?? '';
  return [path, files.get(path) ?? ''];
};

describe('FileRunCards keeps what it parsed', () => {
  it('RF-604 the three reads of Plan setup together read each of 450 card files once', async () => {
    const { files, scope, cardReads } = await seeded();
    const cards = new FileRunCards(files, files);

    const [journey, estimate, source] = await Promise.all([
      cards.cardsOf(scope),
      cards.cardsOf(scope),
      cards.cardsOf(scope),
    ]);

    expect(journey).toHaveLength(450);
    expect(estimate).toEqual(journey);
    expect(source).toEqual(journey);
    expect(cardReads()).toBe(450);
  });

  it('RF-604 the second load reads no card file', async () => {
    const { files, scope, cardReads } = await seeded();
    const cards = new FileRunCards(files, files);
    const first = await cards.cardsOf(scope);
    files.reads.length = 0;

    const second = await cards.cardsOf(scope);

    expect(cardReads()).toBe(0);
    expect(files.reads).toEqual([]);
    expect(second).toEqual(first);
  });

  it('RF-604 a changed card file is read again and seen, the others are not read', async () => {
    const { files, scope, cardReads } = await seeded(60);
    const cards = new FileRunCards(files, files);
    await cards.cardsOf(scope);
    const [path, text] = fileOfCard(files.files, 'FEAT-001');
    await files.writeText(
      { userId: scope.userId, path },
      text.replace('Card number 0', 'Card number changed'),
    );
    files.reads.length = 0;

    const again = await cards.cardsOf(scope);

    expect(again.find((card) => card.id === 'FEAT-001')?.title).toBe('Card number changed');
    expect(cardReads()).toBe(1);
  });
});

describe('FileRunCards keeps what it parsed: changes and limits', () => {
  it('RF-604 a card that no longer reads rejects the read, every time', async () => {
    const { files, scope } = await seeded(10);
    const cards = new FileRunCards(files, files);
    await cards.cardsOf(scope);
    const [path] = fileOfCard(files.files, 'BR-001');
    await files.writeText({ userId: scope.userId, path }, 'not a card');

    await expect(cards.cardsOf(scope)).rejects.toMatchObject({ code: 'RST-1802' });
    await expect(cards.cardsOf(scope)).rejects.toMatchObject({ code: 'RST-1802' });
  });

  it('RF-604 a removed index drops the kept cards', async () => {
    const { files, scope } = await seeded(10);
    const cards = new FileRunCards(files, files);
    await cards.cardsOf(scope);
    await files.remove({
      userId: scope.userId,
      path: `projects/${scope.projectId}/runs/${scope.runKey}/cards/index.json`,
    });

    expect(await cards.cardsOf(scope)).toEqual([]);
  });

  it('RF-1105 a kept parse is never given to another user, who reads the files for himself', async () => {
    const { files, scope, cardReads } = await seeded(10);
    const cards = new FileRunCards(files, files);
    await cards.cardsOf(scope);
    files.reads.length = 0;

    await cards.cardsOf({ ...scope, userId: '00000000-0000-4000-9000-0000000000ff' });

    expect(cardReads()).toBe(10);
  });
});

describe('FilePriorCards keeps what it parsed', () => {
  it('RF-241 the open question cards of 450 are read once and not again', async () => {
    const { files, run, cardReads } = await seeded();
    const prior = new FilePriorCards(files, files);
    const ref = { userId: run.userId, projectId: run.projectId };

    const first = await prior.cardsOf(ref, run.runKey, ['OQ']);
    const second = await prior.cardsOf(ref, run.runKey, ['OQ']);

    expect(first).toHaveLength(90);
    expect(cardReads()).toBe(90);
    expect(second).toEqual(first);
  });

  it('RF-241 answering a question is seen by the next read', async () => {
    const { files, run } = await seeded(20);
    const prior = new FilePriorCards(files, files);
    const ref = { userId: run.userId, projectId: run.projectId };
    const before = (await prior.cardsOf(ref, run.runKey, ['OQ'])).map((card) => card.id);
    const moved = await prior.markAnswered(ref, run.runKey, [before[0] ?? '']);

    const after = await prior.cardsOf(ref, run.runKey, ['OQ']);

    expect(moved).toEqual([before[0]]);
    expect(after.find((card) => card.id === before[0])?.questionState).toBe('Answered');
  });
});
