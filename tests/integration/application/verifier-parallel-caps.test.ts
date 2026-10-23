import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../src/application/ports/llm-provider.js';
import { judgeClaims } from '../../../src/application/understand/claim-judgement.js';
import { assignCardIds } from '../../../src/domain/cards/card-ids.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { budgetRun } from '../../support/budget-harness.js';
import { draftOf } from '../../support/card-fixtures.js';
import { fakeResponse, recordingOf } from '../../support/fake-recordings.js';
import { budgetedVerifier, hold, settle } from '../../support/parallel-judgement.js';
import { fixtureCards } from '../../support/verifier-cards.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// P5-15, RF-304, DEC-13, DEC-112: a cap ends the queued judgements at once, and the parallel
// judgements together never reserve past a cap.

const usage = {
  ...{ inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
  usageSource: 'reported',
} as const;
const unreadable: LlmResponse = fakeResponse({
  text: 'maybe',
  toolCalls: [],
  usage: { ...usage, usageSource: 'reported' },
  finishReason: 'stop',
});

describe('P5-15 a cap ends the queued judgements at once', () => {
  it('RF-304 a cap that refuses one call sends no further call for the claims waiting to retry', async () => {
    let calls = 0;
    const gates = [hold(), hold(), hold(), hold()];
    const h = await verifierHarness({
      recording: recordingOf(),
      provider: () => ({
        complete: async () => {
          calls += 1;
          const mine = calls;
          await gates[mine - 1]?.opened;
          if (mine === 1) throw new RosettaError(ERROR_CODES.budgetCapReached);
          return unreadable;
        },
      }),
    });
    const running = judgeClaims(fixtureCards().slice(0, 4), h.step(4));
    await settle();
    gates[0]?.open();
    await settle();
    for (const each of gates.slice(1)) each.open();
    const cards = await running;

    expect(calls).toBe(4);
    const claims = cards.flatMap((card) => card.claims);
    expect(claims.map((claim) => claim.status)).toEqual(Array(claims.length).fill('Unverified'));
    expect(h.events.map((event) => event.data['claimId'])).toEqual(claims.map((c) => c.claimId));
  });

  it('RF-304 queued claims get no call once the run cap has refused one, and the step ends at once', async () => {
    const { verifier, budget } = await budgetedVerifier(1n);

    const cards = await judgeClaims(fixtureCards(), verifier.step(4));

    const statuses = cards.flatMap((card) => card.claims).map((claim) => claim.status);
    expect(statuses).toEqual(Array(statuses.length).fill('Unverified'));
    expect(budget.fake.requests).toHaveLength(0);
  });
});

const answer = {
  retried: [],
  response: {
    text: 'Reason: Line 8 loads the items.\nVerdict: Supported',
    toolCalls: [],
    usage,
    finishReason: 'stop',
  },
} as const;

function eightClaims() {
  const made = assignCardIds(
    Array.from({ length: 8 }, (_, n) => ({
      agentTaskId: `reader-00${String(n)}`,
      area: `area-${String(n)}`,
      drafts: [
        draftOf({
          title: `Card ${String(n)}`,
          claims: [
            {
              text: `The page loads every catalog item (${String(n)}).`,
              citations: [{ path: 'Default.aspx.cs', startLine: 8, endLine: 12 }],
            },
          ],
        }),
      ],
    })),
  );
  if (!made.ok) throw new Error('fixture');
  return made.value;
}

/** The worst case the guard reserves for one verifier call of the fixture, read from a refusal. */
async function worstCaseOfOneCall(): Promise<bigint> {
  const probe = await budgetedVerifier(1n);
  await judgeClaims(eightClaims().slice(0, 1), probe.verifier.step(1));
  return probe.budget.reported.caps[0]?.needed ?? 0n;
}

describe('P5-15 reservations of parallel judgements never pass a cap', () => {
  it('DEC-112 eight claims judged four at a time reserve at most what the cap allows, the rest are Unverified', async () => {
    const needed = await worstCaseOfOneCall();
    expect(needed).toBeGreaterThan(0n);
    const recording = recordingOf(...Array.from({ length: 8 }, () => answer));
    const { verifier, budget } = await budgetedVerifier(needed * 3n, recording);

    const cards = await judgeClaims(eightClaims(), verifier.step(4));

    const statuses = cards.flatMap((card) => card.claims).map((claim) => claim.status);
    const sent = budget.fake.requests.length;
    expect(sent).toBeLessThanOrEqual(3);
    expect(statuses.filter((status) => status === 'Supported')).toHaveLength(sent);
    expect(statuses.filter((status) => status === 'Unverified')).toHaveLength(8 - sent);
    expect(await budget.ledger.runEntries(budgetRun.userId, budgetRun.id)).toHaveLength(sent);
  });
});
