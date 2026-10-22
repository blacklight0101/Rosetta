import { describe, expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { indexFileClaims, namedRangeClaim } from '../../support/invoice-reader-answer.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// P3-105, RF-301, EV-11: Rosetta's own files are its view of a workbook, never a feature of it. The
// claims INT-001 and INT-004 of the Invoice run said `workbook.md` is an index and were Supported;
// the verifier now rejects a claim about a rendered file without asking the model, and still
// judges a claim that only cites one. The model's answer is recorded (ADR-008).

const span = '0123456789abf003';
const INDEX = 'Invoice_Generator.xlsm/workbook.md';

const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited lines name the ranges.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const rendered = new MemoryRepositoryReader({
  [INDEX]: Array.from({ length: 110 }, (_, index) => `line ${String(index + 1)}`).join('\n'),
});

async function judged(claim: Parameters<typeof judgeClaim>[1]) {
  const h = await verifierHarness({ recording: recordingOf(supported) });
  const judgement = await judgeClaim({ ...h.parts, reader: rendered }, claim, span);
  return { judgement, calls: h.requests().length };
}

describe('the verifier and the rendered files of a workbook', () => {
  it.each(indexFileClaims)(
    'RF-301 rejects $claimId, a claim that workbook.md is a feature, and calls no model',
    async (claim) => {
      const { judgement, calls } = await judged(claim);

      expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected' });
      expect(judgement.kind === 'judged' ? judgement.reason : '').toMatch(/workbook\.md/u);
      expect(judgement.kind === 'judged' ? judgement.reason : '').toMatch(/Rosetta/u);
      expect(calls).toBe(0);
    },
  );

  it('RF-301 still judges a claim about named ranges that only cites workbook.md', async () => {
    const { judgement, calls } = await judged(namedRangeClaim);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(calls).toBe(1);
  });

  it('RF-301 judges a claim that names a file of that name when it cites something else', async () => {
    const { judgement, calls } = await judged({
      claimId: 'ENT-001.c1',
      text: 'The README tells a maintainer to open workbook.md first.',
      citations: [{ path: INDEX, startLine: 1, endLine: 2 }],
    });

    expect(calls).toBe(1);
    expect(judgement).toMatchObject({ kind: 'judged' });
  });
});
