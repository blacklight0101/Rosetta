import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../src/application/ports/llm-provider.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { assignCardIds } from '../../../src/domain/cards/card-ids.js';
import { draftOf } from '../../support/card-fixtures.js';
import { verifierHarness, verifierRecording } from '../../support/verifier-harness.js';

// P3-106, RF-301, EV-06: a claim text with the same citations as another claim of the run is judged
// once, so the two cannot get different verdicts and the verifier is not paid twice.

const lines = [{ path: 'Default.aspx.cs', startLine: 8, endLine: 12 }];
const text = 'The page loads every catalog item.';

function cards(secondText: string, secondLines = lines) {
  const claim = (claimText: string, citations: typeof lines) => ({ text: claimText, citations });
  const made = assignCardIds([
    { agentTaskId: 'reader-001', area: 'a', drafts: [draftOf({ claims: [claim(text, lines)] })] },
    {
      agentTaskId: 'reader-002',
      area: 'b',
      drafts: [draftOf({ title: 'Other', claims: [claim(secondText, secondLines)] })],
    },
  ]);
  if (!made.ok) throw new Error('fixture');
  return made.value;
}

async function judged(input: ReturnType<typeof cards>) {
  let calls = 0;
  const h = await verifierHarness({
    recording: await verifierRecording('verifier-csharp-full.json'),
    provider: (fake): LlmProvider => ({
      complete: (request) => {
        calls += 1;
        return fake.complete(request);
      },
    }),
  });
  const result = await judgeClaims(input, h.step(2));
  return { claims: result.flatMap((card) => card.claims), calls, events: h.events };
}

describe('P3-106 verdict cache', () => {
  it('EV-06 identical text with identical citations is one call and one verdict for both claims', async () => {
    const { claims, calls, events } = await judged(cards(text));

    expect(calls).toBe(1);
    expect(claims.map((claim) => claim.status)).toEqual(['Supported', 'Supported']);
    expect(claims[1]?.verdict?.reason).toBe(claims[0]?.verdict?.reason);
    expect(events.filter((event) => event.type === 'verify.claim.judged')).toHaveLength(2);
  });

  it('RF-301 the same text with other citations is judged on its own', async () => {
    const other = [{ path: 'Default.aspx.cs', startLine: 10, endLine: 10 }];

    const { calls } = await judged(cards(text, other));

    expect(calls).toBe(2);
  });

  it('RF-301 other text with the same citations is judged on its own', async () => {
    const { calls } = await judged(cards('The page shows the list.'));

    expect(calls).toBe(2);
  });
});
