import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { describe, expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { loadVerifierPrompts } from '../../../src/infrastructure/prompts/verifier-prompt-files.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { blockTexts } from '../../support/verifier-cards.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-301, P3-124, HB-04, HB-05, DEC-18, DEC-19: the verifier sees the lines around a citation marked
// as context, so a header or label just outside the range is visible, and a verdict whose reason
// agrees with the claim is never left as Rejected. Synthetic fixture and recorded answers only.

const span = '0123456789abf001';
const lines = [
  '<form id="asset">',
  '  <h2>Asset details</h2>',
  '  <!-- header above -->',
  '  <label>Purchase date</label>',
  '  <input id="PurchaseDate" />',
  '  <input id="Tag" />',
  '</form>',
  '<footer />',
  '<p>far away</p>',
];
const text = (index: number): string => lines[index] ?? '';
const context = (index: number): string => `[context] ${text(index)}`;
const claim = {
  claimId: 'BR-001.c1',
  text: 'The asset form has a Purchase date input.',
  citations: [{ path: 'Asset.html', startLine: 5, endLine: 6 }],
};

const answer = (text: string) =>
  ({
    retried: [],
    response: {
      text,
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
    },
  }) as const;

async function harnessOf(...texts: string[]) {
  const h = await verifierHarness({ recording: recordingOf(...texts.map(answer)) });
  const parts = {
    ...h.parts,
    reader: new MemoryRepositoryReader({ 'Asset.html': lines.join('\n') }),
  };
  return { h, parts };
}

describe('P3-124 the excerpt marks its context lines', () => {
  it('RF-301 the lines around the cited range are sent and marked as context, the cited ones are not', async () => {
    const { h, parts } = await harnessOf('Reason: The input is there.\nVerdict: Supported');

    await judgeClaim(parts, claim, span);

    const [, cited] = blockTexts(h.requests()[0]);
    expect(cited?.split('\n')).toEqual([
      context(1),
      context(2),
      context(3),
      text(4),
      text(5),
      context(6),
      context(7),
      context(8),
    ]);
  });

  it('RF-301 a header two lines above the range is visible, and a recorded Supported stays Supported', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The label Purchase date, two lines above the range, names the input.\nVerdict: Supported',
    );

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    const [, cited] = blockTexts(h.requests()[0]);
    expect(cited).toContain('<label>Purchase date</label>');
  });
});

describe('P3-124 the verifier prompt v3', () => {
  it('RNF-004 is the default, and v2 stays unchanged without the context rule', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const { loadPromptFile } = await import('../../../src/infrastructure/prompts/prompt-files.js');
    const old = await loadPromptFile('prompts', 'verifier/claim.v2.md');

    expect(system).toMatchObject({ name: 'verifier/claim.v3.md', version: 'v3' });
    expect(old.text).not.toContain('[context]');
  });

  it('RF-301 tells the model how context lines are marked and not to reject a claim for a label alone', async () => {
    const { system } = await loadVerifierPrompts('prompts');

    expect(system.text).toContain('[context]');
    expect(system.text).toMatch(/Do not answer `Rejected` only because a label/u);
  });
});

describe('P3-124 a verdict that contradicts its reason', () => {
  it('DEC-19 a Rejected whose reason says the lines match is asked again once, and the new verdict is used', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The cited lines match the claim.\nVerdict: Rejected',
      'Reason: The input PurchaseDate is in the cited lines.\nVerdict: Supported',
    );

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(h.requests()).toHaveLength(2);
    expect(JSON.stringify(h.requests()[1]?.messages.at(-1))).toContain('Rejected');
  });

  it('DEC-19 a verdict that stays contradictory is left Unverified, never Rejected', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The cited lines match the claim.\nVerdict: Rejected',
      'Reason: This matches the claim.\nVerdict: Rejected',
    );

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Unverified' });
    expect(h.requests()).toHaveLength(2);
  });

  it('RF-301 a Rejected whose reason says the lines do not match is kept with one call', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The cited lines do not match the claim: there is no Purchase date input.\nVerdict: Rejected',
    );

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected' });
    expect(h.requests()).toHaveLength(1);
  });
});

describe('P3-124 genuine rejections are never re-asked', () => {
  it.each([
    'The cited lines fail to support the claim.',
    'Nothing in the lines supports the claim.',
    'The lines are insufficient to support the claim.',
    'The lines are unable to support the claim.',
    'The reason is too vague to support this claim.',
    'The lines fall short of supporting the claim.',
    'The lines match the claim only partly.',
    'The label is missing, so the lines do not confirm the claim.',
  ])('DEC-19 %s keeps Rejected with one call', async (reason) => {
    const { h, parts } = await harnessOf(`Reason: ${reason}\nVerdict: Rejected`);

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected' });
    expect(h.requests()).toHaveLength(1);
  });
});

describe('P3-124 the re-ask', () => {
  it('RF-301 the re-ask wording does not steer the model toward Supported', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The cited lines match the claim.\nVerdict: Rejected',
      'Reason: The lines hold the input.\nVerdict: Supported',
    );

    await judgeClaim(parts, claim, span);

    const last = JSON.stringify(h.requests()[1]?.messages.at(-1));
    expect(last).toContain('whichever way');
    expect(last).not.toMatch(/agree with the claim/u);
  });

  it('RF-301 a contradiction that only appears after the format retry is also asked again', async () => {
    const { h, parts } = await harnessOf(
      'no verdict here',
      'Reason: The cited lines match the claim.\nVerdict: Rejected',
      'Reason: The input is on line 5.\nVerdict: Supported',
    );

    const judgement = await judgeClaim(parts, claim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(h.requests()).toHaveLength(3);
  });
});

describe('P3-124 the re-ask is metered and capped', () => {
  it('RF-304 RF-423 the re-ask goes through the guarded provider: it reaches onAnswer and a cap stops it', async () => {
    const { h, parts } = await harnessOf(
      'Reason: The cited lines match the claim.\nVerdict: Rejected',
      'Reason: The input is on line 5.\nVerdict: Supported',
    );
    let answers = 0;
    const metered = { ...parts, onAnswer: () => Promise.resolve(void (answers += 1)) };
    await judgeClaim(metered, claim, span);
    expect(answers).toBe(2);

    let calls = 0;
    const capped = await verifierHarness({
      recording: recordingOf(answer('Reason: The cited lines match the claim.\nVerdict: Rejected')),
      provider: (fake) => ({
        complete: (request) => {
          calls += 1;
          return calls === 1
            ? fake.complete(request)
            : Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached));
        },
      }),
    });
    const stopped = await judgeClaim({ ...capped.parts, reader: parts.reader }, claim, span);

    expect(stopped).toEqual({ kind: 'capped' });
    expect(h.requests()).toHaveLength(2);
  });
});
