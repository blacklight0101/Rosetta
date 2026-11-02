import { describe, expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { explainedMasker } from '../../../src/infrastructure/prompts/masked-value-prompt.js';
import { egressHarness } from '../../support/egress-harness.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { configPath, configText, plainTextClaim } from '../../support/masked-secret-fixtures.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// EV-78, RF-301, P7-22: the Deepen of Invoice Generator wrote "so the earlier claim that no
// identifier column exists is wrong" and the verifier Supported it. The claim is Rejected now,
// without a call; a claim that states what the code does is judged as before.

const span = '0123456789abf004';
const reader = new MemoryRepositoryReader({ [configPath]: configText });

const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited line holds it.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

async function judged(text: string) {
  const egress = await egressHarness({
    masker: explainedMasker('prompts'),
    recording: recordingOf(supported),
  });
  const h = await verifierHarness({ recording: recordingOf(), provider: () => egress.guard });
  const judgement = await judgeClaim({ ...h.parts, reader }, { ...plainTextClaim, text }, span);
  return { judgement, calls: egress.fake.requests.length };
}

describe('the verifier and a claim that refers to an earlier claim', () => {
  it('EV-78 is Rejected with the reason and calls no model', async () => {
    const { judgement, calls } = await judged(
      'A plain-text password is written here, so the earlier claim that it is masked is wrong.',
    );

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected', withoutModel: true });
    expect(JSON.stringify(judgement)).toContain('states what the code does');
    expect(calls).toBe(0);
  });

  it('EV-78 a claim that stands on its own is still judged by the model', async () => {
    const { judgement, calls } = await judged('A plain-text password is written in the file.');

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(calls).toBe(1);
  });
});
