import { describe, expect, it } from 'vitest';
import { packageOf, plain } from '../../support/plan-method-harness.js';

// P6-26, RF-611, RF-643, DEC-176, DEC-189: the answer of the hosted question reaches the package.
// Real plan runs over the recorded planner answer (no provider is called): the brief saved with
// `context.deployment: 'hosted'` gives orchestration.md its delivery-flow section; the brief saved
// with not hosted, or without the key (the answer "not stated"), gives none.

const agents = { aiAssisted: true, agentTool: { kind: 'claude-code' } } as const;
const SECTION = '## Recommended delivery flow';

describe('the hosted question and the delivery flow', () => {
  it('RF-643 a hosted answer gives orchestration.md the delivery-flow section', async () => {
    const files = await packageOf({ buildMethod: agents, context: { deployment: 'hosted' } });

    const text = plain(files['orchestration.md']);
    expect(text).toContain(SECTION);
    expect(text).toMatch(/integration branch/iu);
  }, 60_000);

  it('RF-643 not stated (no key) and not hosted give no delivery-flow section', async () => {
    const notStated = await packageOf({ buildMethod: agents, context: { teamSize: 4 } });
    const notHosted = await packageOf({
      buildMethod: agents,
      context: { deployment: 'not-hosted' },
    });
    const noContext = await packageOf({ buildMethod: agents });

    for (const files of [notStated, notHosted, noContext]) {
      expect(plain(files['orchestration.md'])).not.toContain(SECTION);
    }
  }, 120_000);
});
