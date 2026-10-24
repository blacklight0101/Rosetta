import { describe, expect, it } from 'vitest';
import { runJudgementStep } from '../../../src/application/understand/claim-judgement.js';
import { checkCitations } from '../../../src/application/verifier/citation-check.js';
import { assignCardIds } from '../../../src/domain/cards/card-ids.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { entry } from '../../support/code-map-builders.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { contactDraft, contactPath, contactText } from '../../support/page-markup-fixtures.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// P5-31, P3-122: the route claim of a page whose route is its file path costs no model call.

const at = '2026-10-12T10:00:00.000Z';
const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited lines show it.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

describe('P5-31 the route claim of a page', () => {
  it('P5-31 is decided by the code and never sent to the verifier', async () => {
    const h = await verifierHarness({ recording: recordingOf(supported, supported, supported) });
    const assigned = assignCardIds([
      { agentTaskId: 'reader-001', area: 'Web', drafts: [contactDraft()] },
    ]);
    if (!assigned.ok) throw new Error('fixture');
    const codeMap = { files: [entry(contactPath, 10, { lines: 12 })] };
    const cards = checkCitations(assigned.value, codeMap, at).cards;
    const step = h.step();
    const parts = {
      ...step,
      judge: { ...step.judge, reader: new MemoryRepositoryReader({ [contactPath]: contactText }) },
    };

    const judged = await runJudgementStep(cards, parts);

    const claims = judged.flatMap((card) => card.claims);
    const route = claims.find((claim) => claim.text.startsWith('The screen is at the route'));
    expect(route?.status).toBe('Supported');
    expect(route?.verdict?.model).toBe('rule');
    const sentTexts = h.requests().map((request) => JSON.stringify(request.messages));
    expect(sentTexts.some((text) => text.includes('The screen is at the route'))).toBe(false);
  });
});
