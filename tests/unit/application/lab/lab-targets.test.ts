import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { TargetEnv } from '../../../../src/application/lab/lab-target.js';
import { overviewTarget } from '../../../../src/application/lab/targets/overview-target.js';
import { verifierClaimTarget } from '../../../../src/application/lab/targets/verifier-claim-target.js';
import type { LlmRequest, LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1401, ADR-029: a target turns the inputs of a case into the run's own messages and reads an
// answer with the run's own parser; the prompt under test is the system prompt it is given.

const file = (name: string, text: string): PromptFile => ({
  name,
  version: 'v9',
  sha256: '0'.repeat(64),
  text,
});
const retry = file('verifier/retry.v1.md', 'Problem: {{problem}}');
const under = file('verifier/claim.v9.md', 'You are the verifier under test.');

const source = [
  'export function discountFor(total: number): number {',
  '  return total * 0.2;',
  '}',
];
const input = {
  claim: 'The discount is twenty percent of the total.',
  citations: ['shop/discount.ts:1-3'],
  files: { 'shop/discount.ts': source.join('\n') },
};

function answer(text: string): LlmResponse {
  return fakeResponse({
    text,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  });
}

/** An environment whose provider answers with the texts in order and keeps the requests. */
function environment(texts: readonly string[]): { env: TargetEnv; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  let next = 0;
  const provider = {
    complete: (request: LlmRequest) => {
      requests.push(request);
      const text = texts[next] ?? '';
      next += 1;
      return Promise.resolve(answer(text));
    },
  };
  let calls = 0;
  const env: TargetEnv = {
    role: { provider, model: 'fake-model', maxOutputTokens: 400 },
    ids: new SequenceIdGenerator(),
    signal: new AbortController().signal,
    traceId: 'a'.repeat(32),
    caseKey: 'case-1',
    nextCallId: () => `lab#${String((calls += 1))}`,
  };
  return { env, requests };
}

describe('the verifier claim target', () => {
  const target = verifierClaimTarget(retry);

  it('RF-1401 refuses a case that cites a file it does not hold', () => {
    const parsed = target.parseInput({ ...input, citations: ['shop/other.ts:1-2'] });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.error).toContain('shop/other.ts');
  });

  it('RF-1401 renders the claim and its cited lines as data blocks under the prompt it is given', async () => {
    const parsed = target.parseInput(input);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env, requests } = environment([
      'Reason: Twenty percent is returned.\nVerdict: Supported',
    ]);

    const outcome = await parsed.value.run(env, under);

    expect(outcome).toEqual({ usable: true, detail: 'Supported' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.system).toBe(under.text);
    expect(requests[0]?.context.role).toBe('verifier');
    const message = requests[0]?.messages[0]?.content ?? '';
    expect(message).toContain('ROSETTA-DATA');
    expect(message).toContain(input.claim);
    expect(message).toContain('return total * 0.2;');
  });

  it('RF-1401 asks once more with the retry prompt when the first answer cannot be read', async () => {
    const parsed = target.parseInput(input);
    if (!parsed.ok) throw new Error(parsed.error);
    const { env, requests } = environment(['Maybe.', 'Reason: Seen.\nVerdict: Rejected']);

    const outcome = await parsed.value.run(env, under);

    expect(outcome).toEqual({ usable: true, detail: 'Rejected' });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain('Problem: ');
  });

  it('RF-1401 reads an answer with the verifier parser', () => {
    expect(target.readsAnswer('Reason: Seen.\nVerdict: Supported')).toBe(true);
    expect(target.readsAnswer('Maybe.')).toBe(false);
  });
});

describe('the overview target', () => {
  const target = overviewTarget();
  const cards = {
    cards: [
      {
        id: 'C-001',
        type: 'RULE',
        area: 'shop',
        title: 'Discount',
        summary: 'Gold customers get a discount.',
        claims: ['Gold customers get twenty percent off.'],
      },
    ],
  };

  it('RF-1401 renders the cards as one data block under the prompt it is given', async () => {
    const parsed = target.parseInput(cards);
    if (!parsed.ok) throw new Error(parsed.error);
    const answerText = JSON.stringify({ application: [{ text: 'A shop.', cards: ['C-001'] }] });
    const { env, requests } = environment([answerText]);

    const outcome = await parsed.value.run(env, file('summariser/overview.v9.md', 'Summarise.'));

    expect(outcome.usable).toBe(true);
    expect(requests[0]?.system).toBe('Summarise.');
    expect(requests[0]?.context.role).toBe('summariser');
    expect(requests[0]?.messages[0]?.content).toContain('Gold customers get twenty percent off.');
  });

  it('RF-1401 reads an answer with the overview parser and refuses an empty list of cards', () => {
    expect(target.readsAnswer('{"application":[]}')).toBe(true);
    expect(target.readsAnswer('Sorry, no.')).toBe(false);
    expect(target.parseInput({ cards: [] }).ok).toBe(false);
  });
});
