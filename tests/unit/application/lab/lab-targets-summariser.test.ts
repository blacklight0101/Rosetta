import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { LabTarget, TargetEnv } from '../../../../src/application/lab/lab-target.js';
import { mergeTarget } from '../../../../src/application/lab/targets/merge-target.js';
import { overviewTarget } from '../../../../src/application/lab/targets/overview-target.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1412: the summariser targets label the cheapest wrong answers, so none is usable by default.

const prompt = (name: string): PromptFile => ({
  name,
  version: 'v9',
  sha256: '0'.repeat(64),
  text: 'Under test.',
});

function envOf(text: string): TargetEnv {
  let calls = 0;
  const provider = {
    complete: () =>
      Promise.resolve(
        fakeResponse({
          text,
          toolCalls: [],
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 0,
            usageSource: 'reported',
          },
          finishReason: 'stop',
        }),
      ),
  };
  return {
    role: { provider, model: 'fake-model', maxOutputTokens: 400 },
    ids: new SequenceIdGenerator(),
    signal: new AbortController().signal,
    traceId: 'a'.repeat(32),
    caseKey: 'case-1',
    nextCallId: () => `lab#${String((calls += 1))}`,
  };
}

async function outcomeOf(target: LabTarget, input: unknown, answer: string, name: string) {
  const parsed = target.parseInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value.run(envOf(answer), prompt(name));
}

const card = (id: string, title: string) => ({
  id,
  area: 'Catalog',
  title,
  summary: `${title} summary.`,
  claims: ['A claim.'],
});
const mergeInput = {
  type: 'SCRN',
  cards: [
    card('SCRN-1', 'Catalog list page'),
    card('SCRN-2', 'Catalog product list'),
    card('SCRN-3', 'Order checkout form'),
    card('SCRN-4', 'Basket totals'),
  ],
};
const mergeAnswer = (merges: unknown[]) => JSON.stringify({ merges });
const merging = (ids: string[], title: string) => ({ ids, title, summary: title });

describe('the merge target labels', () => {
  const run = (answer: string) => outcomeOf(mergeTarget(), mergeInput, answer, 'merge.v9.md');

  it('RF-1412 keeps a sound merge and an empty list usable', async () => {
    const sound = mergeAnswer([merging(['SCRN-1', 'SCRN-2'], 'Catalog product list page')]);

    expect(await run(sound)).toEqual({ usable: true, detail: 'Merges' });
    expect(await run(mergeAnswer([]))).toEqual({ usable: true, detail: 'NoMerge' });
  });

  it('RF-1412 refuses the cheapest wrong merges', async () => {
    const lump = mergeAnswer([merging(['SCRN-1', 'SCRN-2', 'SCRN-3', 'SCRN-4'], 'Everything')]);
    const one = mergeAnswer([merging(['SCRN-1'], 'Catalog list page')]);
    const unlisted = mergeAnswer([merging(['SCRN-1', 'SCRN-9'], 'Catalog list page')]);
    const thin = mergeAnswer([merging(['SCRN-1', 'SCRN-3'], 'Catalog list')]);

    expect(await run(lump)).toEqual({ usable: false, detail: 'Lumped' });
    expect(await run(one)).toEqual({ usable: false, detail: 'Invalid' });
    expect(await run(unlisted)).toEqual({ usable: false, detail: 'Invalid' });
    expect(await run(thin)).toEqual({ usable: false, detail: 'Thin' });
    expect(await run('Nothing to merge.')).toEqual({ usable: false, detail: 'Unusable' });
  });
});

const overviewCard = (id: string, type: string, area: string) => ({
  id,
  type,
  area,
  title: id,
  summary: 'A card.',
  claims: ['A claim.'],
});
const overviewInput = {
  cards: [
    overviewCard('FEAT-1', 'FEAT', 'Catalog'),
    overviewCard('SCRN-1', 'SCRN', 'Orders'),
    overviewCard('ENT-1', 'ENT', 'Catalog'),
    overviewCard('INT-1', 'INT', 'Services'),
  ],
};
const said = (...cards: string[]) => [{ text: 'A statement.', cards }];
const overviewAnswer = (over: Record<string, unknown>) =>
  JSON.stringify({
    ...{ application: [], users: [], features: [], screens: [], data: [], integrations: [] },
    ...over,
  });

describe('the overview target labels', () => {
  const run = (answer: string) =>
    outcomeOf(overviewTarget(), overviewInput, answer, 'overview.v9.md');

  it('RF-1412 keeps an answer that reaches every area and section usable', async () => {
    const sound = overviewAnswer({
      application: said('FEAT-1'),
      features: said('FEAT-1'),
      data: said('ENT-1'),
      integrations: said('INT-1'),
      screens: said('SCRN-1'),
    });

    expect(await run(sound)).toEqual({ usable: true, detail: 'Written' });
  });

  it('RF-1412 refuses the cheapest wrong overviews', async () => {
    const lumped = overviewAnswer({ application: said('FEAT-1', 'SCRN-1', 'ENT-1', 'INT-1') });
    const missed = overviewAnswer({ application: said('FEAT-1'), features: said('FEAT-1') });

    expect(await run(overviewAnswer({}))).toEqual({ usable: false, detail: 'Empty' });
    expect(await run(overviewAnswer({ application: said('X-9') }))).toEqual({
      usable: false,
      detail: 'Empty',
    });
    expect(await run(lumped)).toEqual({ usable: false, detail: 'Lumped' });
    expect(await run(missed)).toEqual({ usable: false, detail: 'Missed' });
    expect(await run('{}')).toEqual({ usable: false, detail: 'Unusable' });
  });
});
