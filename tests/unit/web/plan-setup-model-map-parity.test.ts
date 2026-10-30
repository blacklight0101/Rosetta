import { describe, expect, it } from 'vitest';
import { modelMapOf } from '../../../src/domain/planning/build-method.js';
import { modelExample, TIERS } from '../../../web/src/lib/plan-setup/build-method.js';

// RF-639, P7-12: the page keeps its own copy of the model map of each tool (the web code imports
// nothing from src). This test fails when the two copies drift apart.

describe('the model map of the domain and of Plan setup', () => {
  it.each(['claude-code', 'codex'] as const)('RF-639 %s: every tier has the same model', (kind) => {
    const map = modelMapOf({ kind });

    for (const tier of TIERS) expect(modelExample(kind, tier)).toBe(map?.[tier]);
  });

  it('RF-639 another tool has no map in the domain and only an example on the page', () => {
    expect(modelMapOf({ kind: 'other', name: 'Aider' })).toBeUndefined();
    for (const tier of TIERS)
      expect(modelExample('other', tier)).toMatch(/^the .* model of your plan$/u);
  });
});
