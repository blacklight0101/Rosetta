import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { TargetEnv } from '../../../../src/application/lab/lab-target.js';
import { verifierRetryTarget } from '../../../../src/application/lab/targets/verifier-retry-target.js';
import type { LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1413: the retry prompt is measured on a fixed unreadable first answer; the first call costs
// nothing and the one retry goes to the model under the prompt being tried.

const file = (name: string, text: string): PromptFile => ({
  name,
  version: 'v9',
  sha256: '0'.repeat(64),
  text,
});
const system = file('verifier/claim.v6.md', 'You are the verifier.');
const retry = file('verifier/retry.v9.md', 'RETRY-UNDER-TEST: {{problem}}');
const input = {
  claim: 'The discount is twenty percent of the total.',
  citations: ['shop/discount.ts:1-3'],
  files: { 'shop/discount.ts': 'a\nb\nc\n' },
  firstAnswer: 'The lines look related, I think.',
};

function envOf(answer: string): { env: TargetEnv; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  let calls = 0;
  const provider = {
    complete: (request: LlmRequest) => {
      requests.push(request);
      return Promise.resolve(
        fakeResponse({
          text: answer,
          toolCalls: [],
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 0,
            usageSource: 'reported',
          },
          finishReason: 'stop',
        }),
      );
    },
  };
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

async function run(answer: string) {
  const parsed = verifierRetryTarget(system).parseInput(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const { env, requests } = envOf(answer);
  return { outcome: await parsed.value.run(env, retry), requests };
}

describe('the verifier retry target', () => {
  it('RF-1413 sends one call: the retry, after the fixed first answer, under the claim prompt', async () => {
    const { outcome, requests } = await run('Reason: Seen.\nVerdict: Supported');

    expect(outcome).toMatchObject({ usable: true, detail: 'Supported' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.system).toBe(system.text);
    const messages = requests[0]?.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[1]?.content).toBe(input.firstAnswer);
    expect(messages[2]?.content).toContain('RETRY-UNDER-TEST: ');
    expect(messages[2]?.content).not.toContain('{{problem}}');
  });

  it('RF-1413 refuses a case whose first answer the run would have read', () => {
    const readable = { ...input, firstAnswer: 'Reason: Seen.\nVerdict: Supported' };

    expect(verifierRetryTarget(system).parseInput(readable).ok).toBe(false);
  });

  it('RF-1413 fails the cheapest wrong retries', async () => {
    expect((await run('Reason: Fine.\nVerdict: Supported')).outcome.detail).toBe('Supported');
    expect((await run('Reason: No.\nVerdict: Rejected')).outcome.detail).toBe('Rejected');
    expect((await run('Still unsure.')).outcome).toMatchObject({
      usable: false,
      detail: 'Unverified',
    });
  });

  it('RF-1413 reads an answer with the verifier parser', () => {
    const target = verifierRetryTarget(system);

    expect(target.id).toBe('verifier/retry');
    expect(target.readsAnswer('Reason: Seen.\nVerdict: Supported')).toBe(true);
    expect(target.readsAnswer('Maybe.')).toBe(false);
  });
});
