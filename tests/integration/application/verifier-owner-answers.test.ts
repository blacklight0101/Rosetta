import { describe, expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-301, ADR-005, ADR-013, DEC-198, EV-56: the verifier does not let an owner's answer stand as
// source. A claim of a task that was given answers, resting only on the lines the answered question
// was raised from and restating the answer, is Rejected without a model call; a claim on the same
// lines that says what they show is judged by the model like any other. The model's answer is
// recorded (ADR-008).

const span = '0123456789abf004';
const SHEETS = 'Invoice_Generator.xlsm/workbook.md';

const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited lines list the sheets.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const reader = new MemoryRepositoryReader({
  [SHEETS]: Array.from({ length: 30 }, (_, index) => `Sheet ${String(index + 1)}`).join('\n'),
});

const ownerAnswers = [
  {
    ...{ area: 'Invoice_Generator.xlsm', cardId: 'OQ-002' },
    context: `${SHEETS}:14-20 The workbook lists the sheets of the invoice file.`,
    answer:
      'The clerk fills the Template sheet with the customer and the items, then the macro copies the Template into a new invoice sheet.',
  },
];

const cited = [{ path: SHEETS, startLine: 14, endLine: 20 }];

async function judged(text: string, given = true) {
  const h = await verifierHarness({ recording: recordingOf(supported) });
  const owner = given ? { ownerAnswers } : {};
  const claim = { claimId: 'FEAT-001.c14', text, citations: cited };
  const judgement = await judgeClaim({ ...h.parts, reader, ...owner }, claim, span);
  return { judgement, calls: h.requests().length };
}

describe('the verifier and the answers of the owner', () => {
  it('DEC-198 rejects the restated answer without a model call (FEAT-001.c14 of EV-56)', async () => {
    const { judgement, calls } = await judged(
      'The macro copies the Template sheet into a new invoice sheet.',
    );

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected', withoutModel: true });
    expect(judgement.kind === 'judged' ? judgement.reason : '').toContain(
      "restates the owner's answer",
    );
    expect(calls).toBe(0);
  });

  it('DEC-198 judges a claim on the same lines that says what they show', async () => {
    const { judgement, calls } = await judged(
      'The workbook index lists the sheets Items and Totals.',
    );

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(calls).toBe(1);
  });

  it('DEC-198 judges the restating claim like any other when the task was given no answer', async () => {
    const { judgement, calls } = await judged(
      'The macro copies the Template sheet into a new invoice sheet.',
      false,
    );

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(calls).toBe(1);
  });
});
