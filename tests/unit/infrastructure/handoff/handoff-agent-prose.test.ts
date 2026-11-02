import { describe, expect, it } from 'vitest';
import { resolveBuildMethod } from '../../../../src/domain/planning/build-method.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { builderLines } from '../../../../src/infrastructure/handoff/handoff-agent-prose.js';

// RF-642, P6-21, P6-33: the builder prose does not assume a layered architecture; any style (an own
// one included) reads the same.

describe('the builder role prompt', () => {
  it('RF-642 sends the code to where the architecture document puts it, for any style', () => {
    const text = builderLines(
      'middle',
      resolveBuildMethod(undefined, shippedCatalogue.agentModels),
    ).join('\n');

    expect(text).toContain('where the architecture document puts it');
    expect(text).not.toContain('in the layer the architecture names');
  });
});
