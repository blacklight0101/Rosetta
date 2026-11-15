import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import { disagreementsOf } from '../../../../src/application/lab/lab-disagreements.js';
import { parseLabCaseSet } from '../../../../src/application/lab/lab-case-set.js';
import type { TargetEnv } from '../../../../src/application/lab/lab-target.js';
import { verifierClaimTarget } from '../../../../src/application/lab/targets/verifier-claim-target.js';
import type { LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1411: the cheapest wrong verdicts over the calibration set must each fail a measure.

const file = (name: string, text: string): PromptFile => ({
  name,
  version: 'v9',
  sha256: '0'.repeat(64),
  text,
});
const retry = file('verifier/retry.v1.md', 'Problem: {{problem}}');
const under = file('verifier/claim.v9.md', 'You are the verifier under test.');
const setPath = fileURLToPath(
  new URL('../../../../lab/cases/verifier-claim-calibration.json', import.meta.url),
);

function envOf(answerFor: (request: LlmRequest) => string): TargetEnv {
  let calls = 0;
  const provider = {
    complete: (request: LlmRequest) =>
      Promise.resolve(
        fakeResponse({
          text: answerFor(request),
          toolCalls: [],
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cachedInputTokens: 0,
            usageSource: 'reported',
          },
          finishReason: 'stop',
        }),
      ),
  };
  return {
    role: { provider, model: 'fake-model', maxOutputTokens: 400 },
    ids: new SequenceIdGenerator(),
    signal: new AbortController().signal,
    traceId: 'a'.repeat(32),
    caseKey: 'case-1',
    nextCallId: () => `lab#${String((calls += 1))}`,
  };
}

interface Measured {
  readonly expected: string | null;
  readonly detail: string;
  readonly usable: boolean;
}

async function measure(answerFor: (request: LlmRequest) => string): Promise<Measured[]> {
  const parsed = parseLabCaseSet(JSON.parse(await readFile(setPath, 'utf8')));
  if (!parsed.ok) throw new Error(parsed.error.join('; '));
  const target = verifierClaimTarget(retry);
  const measured: Measured[] = [];
  for (const each of parsed.value.cases) {
    const prepared = target.parseInput(each.input);
    if (!prepared.ok) throw new Error(prepared.error);
    const outcome = await prepared.value.run(envOf(answerFor), under);
    measured.push({ expected: each.expected ?? null, ...outcome });
  }
  return measured;
}

const agreement = (cases: readonly Measured[]): number =>
  cases.filter((each) => each.expected === each.detail).length / cases.length;

describe('the cheapest wrong verdicts over the calibration set', () => {
  it('RF-1411 fails "everything is supported" on agreement and on false "supported"', async () => {
    const cases = await measure(() => 'Reason: Fine.\nVerdict: Supported');

    expect(agreement(cases)).toBe(0.5);
    expect(disagreementsOf(cases)).toEqual({ 'Rejected -> Supported': 15 });
  });

  it('RF-1411 fails "everything is not supported" on agreement and on false "not supported"', async () => {
    const cases = await measure(() => 'Reason: No.\nVerdict: Rejected');

    expect(agreement(cases)).toBe(0.5);
    expect(disagreementsOf(cases)).toEqual({ 'Supported -> Rejected': 15 });
  });

  it('RF-1411 fails an answer with no verdict: every case Unverified and not usable', async () => {
    const cases = await measure(() => 'I cannot tell.');

    expect(agreement(cases)).toBe(0);
    expect(cases.every((each) => !each.usable)).toBe(true);
    expect(disagreementsOf(cases)).toEqual({
      'Rejected -> Unverified': 15,
      'Supported -> Unverified': 15,
    });
  });

  it('RF-1411 passes only an answer that follows the hand label', async () => {
    const parsed = parseLabCaseSet(JSON.parse(await readFile(setPath, 'utf8')));
    if (!parsed.ok) throw new Error(parsed.error.join('; '));
    const labelOf = new Map(
      parsed.value.cases.map((each) => [JSON.stringify(each.input), each.expected]),
    );
    const cases = await measure((request) => {
      const text = request.messages.map((message) => message.content).join('\n');
      const claim = parsed.value.cases.find((each) =>
        text.includes((each.input as { claim: string }).claim),
      );
      const label = claim === undefined ? undefined : labelOf.get(JSON.stringify(claim.input));
      return `Reason: Read.\nVerdict: ${label ?? 'Rejected'}`;
    });

    expect(agreement(cases)).toBe(1);
    expect(disagreementsOf(cases)).toEqual({});
  });
});
