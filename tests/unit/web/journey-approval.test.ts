import { describe, expect, it } from 'vitest';
import type { RunEstimate } from '../../../web/src/api/estimate-schemas.js';
import {
  approvalText,
  approvedAmountOf,
  basisMovedText,
  ceilingNoteText,
  likelyText,
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
      approvable: { tokens: 8_400_000, costMicros: '4100000' },
      ceilingApplied: false,
    },
  };
}

function journeyOf(estimate: RunEstimate): NonNullable<RunEstimate['journey']> {
  if (estimate.journey === undefined) throw new Error('No journey.');
  return estimate.journey;
}

const gateInput = {
  ...{ stage: 'understand' as const, chosenAreas: 1, consentNeeded: '', consentGiven: false },
};

describe('RF-430 the approved figure on the start button', () => {
  it('RF-430 DEC-206 approves the journey figure in dollars for a priced estimate', () => {
    const estimate = estimateWith([role({})]);

    expect(approvalText(estimate)).toBe('$4.10');
    expect(worstCaseText(estimate)).toBe('$4.10');
    expect(approvedAmountOf(estimate)).toEqual({ tokens: 8_400_000, costMicros: 4_100_000 });
  });

  it('RF-430 names tokens for an estimate on local models only', () => {
    const estimate = estimateWith([role({ kind: 'ollama', provider: 'ollama', priced: false })]);

    expect(approvalText(estimate)).toBe('8,400,000 tokens');
  });

  it('RF-430 the button label carries the approved figure', () => {
    const estimate = estimateWith([role({})]);
    const gate = startGate({
      ...gateInput,
      estimate: { status: 'ready', estimate },
      approval: approvalText(estimate) ?? '',
    });

    expect(gate).toEqual({ label: 'Analyse · approve $4.10', reason: undefined });
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

describe('RF-430 DEC-206 the approvable figure and the likely figure beside it', () => {
  const lowered = (estimate: RunEstimate): RunEstimate => ({
    ...estimate,
    journey: {
      ...journeyOf(estimate),
      worstCase: { tokens: 375_900_000, costMicros: '314170000' },
      approvable: { tokens: 50_000_000, costMicros: '4000000' },
      ceilingApplied: true,
    },
  });

  it('RF-430 DEC-206 the button approves the approvable figure, not the worst case above the ceilings', () => {
    const estimate = lowered(estimateWith([role({})]));

    expect(approvalText(estimate)).toBe('$4.00');
    expect(approvedAmountOf(estimate)).toEqual({ tokens: 50_000_000, costMicros: 4_000_000 });
    expect(likelyText(estimate)).toBe('$1.20');
  });

  it('RF-430 DEC-206 names the ceiling that lowered the figure, and says nothing when none did', () => {
    const estimate = estimateWith([role({})]);

    expect(ceilingNoteText(lowered(estimate))).toContain('$314.17');
    expect(ceilingNoteText(lowered(estimate))).toContain('$4.00');
    expect(ceilingNoteText(estimate)).toBeUndefined();
  });

  it('RF-430 DEC-206 says why the figure moved when the basis changed between two estimates', () => {
    const before = estimateWith([role({})]);
    const after = {
      ...before,
      journey: {
        ...journeyOf(before),
        basis: 'history' as const,
      },
    };

    expect(basisMovedText(before, after)).toContain('measured');
    expect(basisMovedText(before, before)).toBeUndefined();
  });
});
