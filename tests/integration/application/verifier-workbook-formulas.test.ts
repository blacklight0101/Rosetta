import { expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { invoiceRendered } from '../../support/invoice-formula-files.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// RF-301, RF-152, P3-94: the claims a build trial found correct and the verifier rejected, because
// the cited lines of formulas.md did not tell the header of the column. With the table column named
// in the region heading the lines carry it, so the verifier is sent it. The verdict is a recorded
// answer (ADR-008): the test shows what the verifier is sent and that a supported verdict is kept.

const span = '0123456789abf002';
const PATH = 'Invoice_Sample.xlsm/Invoice/formulas.md';

const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited lines name the column and show the sum of the three amount columns.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const agreedTotal = {
  claimId: 'BR-001.c1',
  text: 'Agreed Amount Total (column G) is Amount Line 1 + Amount Line 2 + Amount Line 3.',
  citations: [{ path: PATH, startLine: 4, endLine: 5 }],
};

async function judged(rendered: string) {
  const h = await verifierHarness({ recording: recordingOf(supported) });
  const reader = new MemoryRepositoryReader({ [PATH]: rendered });
  const judgement = await judgeClaim({ ...h.parts, reader }, agreedTotal, span);
  const sent = h
    .requests()
    .flatMap((request) => request.messages.map((message) => message.content));
  return { judgement, sent: sent.join('\n') };
}

it('RF-301 sends the verifier the header of the column with the formula it cites, and keeps Supported', async () => {
  const { judgement, sent } = await judged(invoiceRendered()[PATH] ?? '');

  expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
  expect(sent).toContain(
    '## Region G8:G12 (5 formulas), InvoiceTable column "Agreed Amount Total"',
  );
  expect(sent).toContain('G8 = InvoiceTable[[#This Row],[Amount Line 1]]');
});

it('RF-301 the same lines of a file rendered before carried no header, which is what the build trial met', async () => {
  const before = (invoiceRendered()[PATH] ?? '').replaceAll(/, InvoiceTable column "[^"]+"/gu, '');

  const { sent } = await judged(before);

  expect(sent).toContain('## Region G8:G12 (5 formulas)');
  expect(sent).not.toContain('InvoiceTable column');
});
