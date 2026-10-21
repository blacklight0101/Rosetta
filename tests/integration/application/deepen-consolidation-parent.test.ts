import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { completedRun } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import type { UnderstandHarnessOptions } from '../../support/understand-run-harness.js';

// RF-250, RF-006, RF-209, Q-52, P3-67: a Deepen starts from the merges the parent run made. The
// parent's consolidation record is made again (the surviving card keeps its id), a type the parent
// answered about is not asked again, and a failed or capped summariser call keeps the cards and
// lets the Deepen finish. Recorded answers only.

const temp = useTempRoot('rosetta-deepen-consolidation-parent-');

const parentRecord = {
  schemaVersion: 1,
  types: [{ type: 'BR', cardIds: ['BR-001', 'BR-002'] }],
  merges: [{ ids: ['BR-001', 'BR-002'], title: 'Item rules', summary: 'Both areas.' }],
};

const recordSchema = z.object({ merges: z.array(z.object({ ids: z.array(z.string()) })) });

type Extra = Pick<UnderstandHarnessOptions, 'beforeCall'>;

/** A parent run whose summariser merged the two rules, then a Deepen over it. */
async function deepenedOverMerge(recording: string, extra: Extra = {}) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording,
    verifierRecording: 'verifier-deepen-supported.json',
    ...extra,
  });
  await writeFile(
    join(h.runFolder(run), 'consolidation.json'),
    `${JSON.stringify(parentRecord, null, 2)}\n`,
  );
  const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, deep: deepen.value };
}

const summariserCalls = (h: {
  providers: { requests(): readonly { context: { role: string } }[] };
}) => h.providers.requests().filter((request) => request.context.role === 'summariser');

async function brFiles(folder: string): Promise<string[]> {
  return (await readdir(join(folder, 'cards', 'BR'))).sort();
}

describe('RF-250 a Deepen over a parent that merged', UNDERSTAND_TIMEOUT, () => {
  it('RF-250 makes the parent merge again, keeps its id and does not ask about the type again', async () => {
    const { h, deep } = await deepenedOverMerge('deepen-extends.json');

    expect(summariserCalls(h)).toHaveLength(1);
    const folder = h.runFolder(deep);
    expect(await brFiles(folder)).toEqual(['BR-001.md']);
    const card = await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toContain('Updating an item lowers its stock by one.');
    expect(card).toContain('The name label shows the text Item when the page loads.');
    expect(card).toMatch(/mergedFrom:\n\s+- "BR-001"\n\s+- "BR-002"/u);
  });

  it('RF-250 publishes the parent merge as a cards.merged event of this run', async () => {
    const { h, deep } = await deepenedOverMerge('deepen-extends.json');

    const merged = (await h.eventsOf(deep)).filter((event) => event.type === 'cards.merged');
    expect(merged.map((event) => [event.data['cardId'], event.data['from']])).toEqual([
      ['BR-001', ['BR-001', 'BR-002']],
    ]);
  });

  it('RF-250 a rule a round wrote joins the parent merge under the parent id, asking once more', async () => {
    const { h, deep } = await deepenedOverMerge('deepen-merges-within-area.json');

    expect(summariserCalls(h)).toHaveLength(2);
    const folder = h.runFolder(deep);
    expect(await brFiles(folder)).toEqual(['BR-001.md']);
    const card = await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toMatch(/mergedFrom:\n\s+- "BR-001"\n\s+- "BR-002"\n\s+- "BR-003"/u);
    const record = recordSchema.parse(
      JSON.parse(await readFile(join(folder, 'consolidation.json'), 'utf8')),
    );
    expect(record.merges.map((merge) => merge.ids)).toEqual([
      ['BR-001', 'BR-002'],
      ['BR-001', 'BR-003'],
    ]);
  });
});

const failing = (
  code: typeof ERROR_CODES.providerCallFailed | typeof ERROR_CODES.budgetCapReached,
) => ({
  // Call 8 is the Deepen's summariser call: four parent reader calls, the parent's merge, two
  // reader calls of the round.
  beforeCall: (call: number) =>
    call === 8 ? Promise.reject(new RosettaError(code, 'Refused.')) : Promise.resolve(),
});

describe('RF-250 a Deepen whose summariser call does not answer', UNDERSTAND_TIMEOUT, () => {
  it.each([
    ['fails', ERROR_CODES.providerCallFailed],
    ['is refused by a cap', ERROR_CODES.budgetCapReached],
  ] as const)('RF-250 keeps every card and finishes when the call %s', async (_name, code) => {
    const { h, deep } = await deepenedOverMergeFree(
      'deepen-merges-within-area.json',
      failing(code),
    );

    expect(deep.endState).toBe('Completed');
    expect(await brFiles(h.runFolder(deep))).toEqual(['BR-001.md', 'BR-002.md', 'BR-003.md']);
  });
});

/** Like `deepenedOverMerge`, with the parent's own record (no merge) and extra harness options. */
async function deepenedOverMergeFree(recording: string, extra: Extra) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording,
    verifierRecording: 'verifier-deepen-supported.json',
    ...extra,
  });
  const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, deep: deepen.value };
}

function runCap(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens } },
  });
}

describe('RF-006 a Deepen resumed after a cap stopped it', UNDERSTAND_TIMEOUT, () => {
  async function cappedThenResumed() {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-merges-within-area.json',
      verifierRecording: 'verifier-deepen-supported.json',
    });
    await h.changeSettings(runCap(500));
    const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
    if (!deepen.ok) throw new Error(deepen.error);
    await h.changeSettings(runCap(5_000_000));
    const resumed = await h.resume(deepen.value);
    return { h, capped: deepen.value, resumed };
  }

  it('RF-006 merges at the end of the resumed Deepen: the first card keeps its id and the other goes', async () => {
    const { h, capped, resumed } = await cappedThenResumed();

    expect(capped.endState).toBe('CapReached');
    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.value.endState).toBe('Completed');
    expect(await brFiles(h.runFolder(capped))).toEqual(['BR-001.md', 'BR-002.md']);
    const card = await readFile(join(h.runFolder(capped), 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toMatch(/mergedFrom:\n\s+- "BR-001"\n\s+- "BR-00\d"/u);
  });
});
