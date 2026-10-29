import { describe, expect, it } from 'vitest';
import {
  parseBriefAnswers,
  parsePlanningBrief,
} from '../../../../src/application/planning/planning-brief-schema.js';
import { buildBrief } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-639, RF-641, DEC-185, data-model.md section 3.20 (P6-22): the optional "runs locally" flag of a
// tier model is additive: the schema reads it, bounds it, and a brief without it reads unchanged.

const claude = { aiAssisted: true, agentTool: { kind: 'claude-code' } } as const;
const at = '2026-10-29T09:00:00.000Z';

describe('the runs-locally flag in a save', () => {
  it('RF-639 reads a flag on each of the three tier models', () => {
    const buildMethod = { ...claude, local: { smallest: true, middle: true, largest: true } };

    expect(parseBriefAnswers({ buildMethod })).toEqual({ buildMethod });
  });

  it.each([
    ['a flag on the escalation model', { local: { escalation: true } }],
    ['a flag that is not true', { local: { middle: false } }],
    ['a flag that is text', { local: { middle: 'yes' } }],
    ['an unknown tier', { local: { huge: true } }],
    ['a list instead of an object', { local: ['middle'] }],
  ])('RF-639 refuses %s', (_name, extra) => {
    expect(parseBriefAnswers({ buildMethod: { ...claude, ...extra } })).toBeUndefined();
  });
});

describe('the runs-locally flag in the stored brief', () => {
  it('RF-639 keeps the flag of a tier through write and read', () => {
    const saved = {
      ...buildBrief({ buildMethod: { ...claude, local: { middle: true } } }, shippedCatalogue),
      savedAt: at,
    };

    expect(saved.buildMethod.local).toEqual({ middle: true });
    expect(parsePlanningBrief(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('RF-639 a brief without the flag has no key and reads unchanged', () => {
    const saved = { ...buildBrief({ buildMethod: claude }, shippedCatalogue), savedAt: at };
    const text = JSON.stringify(saved);

    expect(text).not.toContain('local');
    expect(parsePlanningBrief(JSON.parse(text))).toEqual(saved);
  });

  it('RF-639 an empty flag object is dropped, and people building keep no flag', () => {
    const empty = buildBrief({ buildMethod: { ...claude, local: {} } }, shippedCatalogue);
    const people = buildBrief(
      { buildMethod: { aiAssisted: false, local: { middle: true } } },
      shippedCatalogue,
    );

    expect(empty.buildMethod).not.toHaveProperty('local');
    expect(people.buildMethod).toEqual({ aiAssisted: false });
  });

  it('RF-639 no flag is kept before the agent tool is answered', () => {
    const built = buildBrief(
      { buildMethod: { aiAssisted: true, local: { middle: true } } },
      shippedCatalogue,
    );

    expect(built.buildMethod).not.toHaveProperty('local');
  });
});
