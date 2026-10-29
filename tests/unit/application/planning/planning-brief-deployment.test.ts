import { describe, expect, it } from 'vitest';
import {
  parseBriefAnswers,
  parsePlanningBrief,
} from '../../../../src/application/planning/planning-brief-schema.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-643, Q-H, data-model.md section 3.20: the project context may say the new application is
// hosted (`deployment`). It is additive: a brief saved without it still reads and has no such key.

const stamp = '2026-10-29T10:00:00.000Z';

describe('the deployment field of the project context', () => {
  it('RF-643 a brief without it has no deployment key and still parses equal', () => {
    const brief = { ...buildBrief({}, shippedCatalogue), savedAt: stamp };

    expect(brief.context).not.toHaveProperty('deployment');
    expect(parsePlanningBrief(JSON.parse(JSON.stringify(brief)))).toEqual(brief);
  });

  it('RF-643 hosted is saved in the brief and read back equal', () => {
    const answers = parseBriefAnswers({ context: { deployment: 'hosted' }, stack: [] });
    expect(answers).toBeDefined();
    if (answers === undefined) return;

    const brief = { ...buildBrief(answers, shippedCatalogue), savedAt: stamp };

    expect(brief.context.deployment).toBe('hosted');
    expect(parsePlanningBrief(JSON.parse(JSON.stringify(brief)))).toEqual(brief);
  });

  it('RF-643 any other value is refused', () => {
    expect(parseBriefAnswers({ context: { deployment: 'cloud' }, stack: [] })).toBeUndefined();
  });
});
