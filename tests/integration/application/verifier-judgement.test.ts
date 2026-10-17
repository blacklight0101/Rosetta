import { describe, expect, it } from 'vitest';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { blockExcerpts, blockTexts, fixtureCards } from '../../support/verifier-cards.js';
import { verifierHarness, verifierRecording } from '../../support/verifier-harness.js';

// RF-301, ADR-005, ADR-008, DEC-57: step 2 of the verifier with recorded answers. The fake replays
// the verifier recordings; the cited lines are the files of the webforms-csharp fixture.

const span = '0123456789abf001';

const detailsClaim = {
  claimId: 'BR-001.c1',
  text: 'The name label is set to the text Item when the page loads.',
  citations: [{ path: 'Catalog/Details.aspx.cs', startLine: 5, endLine: 8 }],
};

describe('verifier judgement', () => {
  it('RF-301 each claim that passed step 1 gets Supported or Rejected with a one-line reason, published as it arrives', async () => {
    const h = await verifierHarness({
      recording: await verifierRecording('verifier-csharp-full.json'),
    });

    const judged = await judgeClaims(fixtureCards(), h.step());

    const claims = judged.flatMap((card) => card.claims);
    expect(claims.map((claim) => [claim.claimId, claim.status])).toEqual([
      ['FEAT-001.c1', 'Supported'],
      ['OQ-001.c1', 'Supported'],
      ['BR-001.c1', 'Supported'],
      ['ENT-001.c1', 'Supported'],
      ['BR-002.c1', 'Rejected'],
    ]);
    expect(claims.at(-1)?.verdict).toEqual({
      step: 'judgement',
      reason:
        'Line 12 only assigns the UPDATE text to a variable that List returns; nothing in the lines runs it.',
      model: 'judge-model',
      at: '2026-10-12T10:00:00.000Z',
    });
    expect(h.events.map((event) => [event.type, event.agentTaskId, event.data['status']])).toEqual([
      ['verify.claim.judged', 'reader-001', 'Supported'],
      ['verify.claim.judged', 'reader-001', 'Supported'],
      ['verify.claim.judged', 'reader-002', 'Supported'],
      ['verify.claim.judged', 'reader-003', 'Supported'],
      ['verify.claim.judged', 'reader-004', 'Rejected'],
    ]);
    expect(h.events[4]?.data).toEqual({
      claimId: 'BR-002.c1',
      status: 'Rejected',
      reason: claims.at(-1)?.verdict?.reason,
    });
  });
});

describe('verifier judgement: what the verifier sees', () => {
  it('RF-301 the verifier sees the claim and only the cited lines with a margin of three lines', async () => {
    const h = await verifierHarness({
      recording: await verifierRecording('verifier-csharp-full.json'),
    });

    await judgeClaims(fixtureCards(), h.step());

    const request = h.requests()[4];
    expect(request?.context).toMatchObject({ role: 'verifier', agentTaskId: 'verifier-BR-002.c1' });
    expect(request?.system).toBe(h.prompts.system.text);
    expect(request?.tools).toEqual([]);
    expect(request?.messages).toHaveLength(1);
    const [claim, lines] = blockTexts(request);
    expect(claim).toBe('Stock goes down by one.');
    const range = { path: 'Services/CatalogService.cs', startLine: 9, endLine: 15 };
    const file = await h.reader.readLines(range);
    expect(lines).toBe(file.ok ? file.value.lines.join('\n') : 'unread');
    expect(lines).toContain('UPDATE CatalogItem SET Stock = Stock - 1');
    expect(lines).not.toContain('SELECT Id, Name, Price');
    expect(blockExcerpts(request)).toEqual([range]);
  });
});

describe('verifier judgement: answers that cannot be read', () => {
  it('RF-301 an answer that is not one of the allowed values gets one retry that names the problem', async () => {
    const h = await verifierHarness({ recording: await verifierRecording('verifier-retry.json') });

    const judgement = await judgeClaim(h.parts, detailsClaim, span);

    expect(judgement).toEqual({
      kind: 'judged',
      status: 'Supported',
      reason: 'Line 7 sets NameLabel.Text to "Item" inside Page_Load.',
    });
    const [first, retry] = h.requests();
    expect(h.requests()).toHaveLength(2);
    expect(retry?.messages.slice(0, 1)).toEqual(first?.messages);
    expect(retry?.messages[1]).toEqual({ role: 'assistant', content: 'Supported' });
    expect(retry?.messages[2]?.content).toContain(
      'Your last answer could not be read: the answer must be exactly two lines',
    );
    expect(retry?.context.agentTaskId).toBe(first?.context.agentTaskId);
    expect(retry?.context.callId).not.toBe(first?.context.callId);
  });

  it('RF-301 an answer that is invalid twice leaves the claim Unverified after exactly one retry', async () => {
    const h = await verifierHarness({
      recording: await verifierRecording('verifier-invalid-twice.json'),
    });

    const judgement = await judgeClaim(h.parts, detailsClaim, span);

    expect(judgement).toEqual({
      kind: 'judged',
      status: 'Unverified',
      reason:
        'The verifier\'s answer could not be read after one retry: the second line must be "Verdict: Supported" or "Verdict: Rejected".',
    });
    expect(h.requests()).toHaveLength(2);
  });
});

describe('verifier judgement: the order of the answer', () => {
  it('RF-301 DEC-57 a verdict written before its reason is retried, and the prompt asks for the reason first', async () => {
    const h = await verifierHarness({
      recording: await verifierRecording('verifier-verdict-first.json'),
    });

    const judgement = await judgeClaim(h.parts, detailsClaim, span);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(h.requests()[1]?.messages[2]?.content).toContain(
      'the reason must come before the verdict.',
    );
    expect(h.prompts.system.text).toContain('first the reason, then the verdict');
    expect(h.prompts.system.text).toMatch(
      /Reason: <one sentence>\r?\nVerdict: <Supported or Rejected>/u,
    );
  });
});
