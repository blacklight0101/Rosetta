import { describe, expect, it } from 'vitest';
import { judgeClaim } from '../../../src/application/verifier/judge-claim.js';
import { MaskedLineFinder } from '../../../src/infrastructure/guards/masked-line-finder.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { explainedMasker } from '../../../src/infrastructure/prompts/masked-value-prompt.js';
import { egressHarness } from '../../support/egress-harness.js';
import { recordingOf } from '../../support/fake-recordings.js';
import {
  configPath,
  configText,
  fakePassword,
  maskedInSourceClaim,
  plainTextClaim,
} from '../../support/masked-secret-fixtures.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import { verifierHarness } from '../../support/verifier-harness.js';

// P5-34, RF-301, RF-141: the card INT-001 of the school benchmark said the password "is masked in
// the source" and was Supported, though App.config holds it in plain text. The claim that a
// plain-text password is written there is Supported; the claim that it is masked is Rejected
// without a call; neither the value nor a copy of it reaches any output. The model is recorded.

const span = '0123456789abf003';

const supported = {
  retried: [],
  response: {
    text: 'Reason: The cited line holds the connection string with a masked password value.\nVerdict: Supported',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
    finishReason: 'stop',
  },
} as const;

const reader = new MemoryRepositoryReader({ [configPath]: configText });

async function judged(claim: Parameters<typeof judgeClaim>[1]) {
  // The verifier's provider is the real egress guard with the production masker in front of the fake.
  const egress = await egressHarness({
    masker: explainedMasker('prompts'),
    recording: recordingOf(supported),
  });
  const h = await verifierHarness({ recording: recordingOf(), provider: () => egress.guard });
  const parts = {
    ...h.parts,
    reader,
    secretLines: new MaskedLineFinder(new SecretMasker()),
  };
  const judgement = await judgeClaim(parts, claim, span);
  return {
    judgement,
    calls: egress.fake.requests.length,
    sent: JSON.stringify(egress.fake.requests),
  };
}

describe('the verifier and a value Rosetta masked', () => {
  it('P5-34 the claim that a plain-text password is written there is Supported, and the value is in no output', async () => {
    const { judgement, calls, sent } = await judged(plainTextClaim);
    expect(sent).toContain('written here in plain text');
    expect(sent).not.toContain(fakePassword);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Supported' });
    expect(calls).toBe(1);
    expect(JSON.stringify(judgement)).not.toContain(fakePassword);
  });

  it('P5-34 the claim that the password is masked in the source is Rejected and calls no model', async () => {
    const { judgement, calls } = await judged(maskedInSourceClaim);

    expect(judgement).toMatchObject({ kind: 'judged', status: 'Rejected', withoutModel: true });
    expect(calls).toBe(0);
    expect(JSON.stringify(judgement)).not.toContain(fakePassword);
  });
});
