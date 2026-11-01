import { describe, expect, it } from 'vitest';
import type { RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import {
  approvalText,
  approvedAmountOf,
  missingKeyProviders,
  worstCaseText,
} from '../../../web/src/lib/journey-approval.js';
import { startGate } from '../../../web/src/pages/start-gate.js';

// RF-430, RF-431, DEC-196: the start button names the journey figure the user approves, which the
// run records as its approved amount; a role whose key is missing holds Start back with a reason.

const point = { inputTokens: 800, outputTokens: 200, costMicros: '1000' };
const role = (overrides: Partial<RunEstimate['roles'][number]>): RunEstimate['roles'][number] => ({
  ...{ role: 'reader', provider: 'openai', kind: 'openai', model: 'priced-model' },
  ...{ keySource: 'user', priced: true, low: point, likely: point, high: point },
  ...overrides,
});

function estimateWith(roles: RunEstimate['roles']): RunEstimate {
  return {
    ...{ priceTableVersion: '2026-10-11', currency: 'USD', areas: [] },
    assumptions: { turnsPerArea: { low: 2, likely: 3, high: 10 } },
    ...{ roles, total: { low: point, likely: point, high: point } },
    journey: {
      ...{ basis: 'assumptions', deepenRounds: 3 },
      likely: { tokens: 2_600_000, costMicros: '1200000' },
      worstCase: { tokens: 8_400_000, costMicros: '4100000' },
    },
  };
}

const gateInput = {
  ...{ stage: 'understand' as const, chosenAreas: 1, consentNeeded: '', consentGiven: false },
};

describe('RF-430 the approved figure on the start button', () => {
  it('RF-430 names the likely journey total in dollars for a priced estimate, with the worst case beside it', () => {
    const estimate = estimateWith([role({})]);

    expect(approvalText(estimate)).toBe('$1.20');
    expect(worstCaseText(estimate)).toBe('$4.10');
    expect(approvedAmountOf(estimate)).toEqual({ tokens: 2_600_000, costMicros: 1_200_000 });
  });

  it('RF-430 names tokens for an estimate on local models only', () => {
    const estimate = estimateWith([role({ kind: 'ollama', provider: 'ollama', priced: false })]);

    expect(approvalText(estimate)).toBe('2,600,000 tokens');
  });

  it('RF-430 the button label carries the approved figure', () => {
    const estimate = estimateWith([role({})]);
    const gate = startGate({
      ...gateInput,
      estimate: { status: 'ready', estimate },
      approval: '$1.20',
    });

    expect(gate).toEqual({ label: 'Start run · approve $1.20', reason: undefined });
  });
});

describe('RF-431 the estimate shows a missing key', () => {
  it('RF-431 names the providers whose key is missing and holds Start back', () => {
    const estimate = estimateWith([
      role({ keyMissing: true, keySource: 'server' }),
      role({ role: 'verifier', keyMissing: true, keySource: 'server' }),
    ]);

    expect(missingKeyProviders(estimate)).toEqual(['openai']);
    const gate = startGate({
      ...gateInput,
      estimate: { status: 'ready', estimate },
      keyMissing: 'OpenAI',
    });
    expect(gate.reason).toBe('The OpenAI key is missing: add your own key in Settings and keys.');
  });
});
