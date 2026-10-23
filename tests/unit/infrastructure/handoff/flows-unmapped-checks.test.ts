import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-625, RF-627: checks.md counts, per flow, the steps no component covers.

const masker = new SecretMasker();

describe('checks.md: flow steps not mapped', () => {
  it('RF-625 counts the not mapped steps of each flow', () => {
    const checks = renderHandoff(handoffOf('Plain text.'), masker)['checks.md'] ?? '';

    expect(checks).toContain('## Flow steps not mapped');
    expect(checks).toMatch(/- FLOW\\?-001: 1 step of 2/u);
  });

  it('RF-625 says nothing when every step is mapped', () => {
    const base = handoffOf('Plain text.');
    const [flow] = base.flows.flows;
    if (flow === undefined) throw new Error('The fixture has a flow');
    const mapped = { ...flow, steps: flow.steps.map((step) => ({ ...step, component: 'Web' })) };
    const handoff = { ...base, flows: { ...base.flows, flows: [mapped] } };

    const checks = renderHandoff(handoff, masker)['checks.md'] ?? '';

    expect(checks).not.toContain('Flow steps not mapped');
  });
});
