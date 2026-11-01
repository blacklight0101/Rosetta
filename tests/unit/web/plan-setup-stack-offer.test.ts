import { describe, expect, it } from 'vitest';
import { questionOptions, optionTitle } from '../../../web/src/lib/plan-setup/question-options.js';
import type { StackOffer } from '../../../web/src/api/plan-schemas.js';
import { catalogue, planOptions } from './plan-setup-fixtures.js';

// P7-29, RF-609, RF-645, DEC-203: each stack layer offers the recommended proposal first, the
// second one, "Keep the legacy technology" and "Type your own answer" (the last one is the page's).

const offer: StackOffer = {
  layers: [
    {
      layer: 'database',
      proposals: [
        { choice: 'SQL Server', why: 'The schema stays.' },
        { choice: 'PostgreSQL', why: 'Open source.' },
      ],
      keepLegacy: true,
      vague: [],
    },
    {
      layer: 'hosting',
      proposals: [
        { choice: 'Docker containers', why: 'One image.' },
        { choice: 'Azure App Service', why: 'Managed.' },
      ],
      keepLegacy: false,
      vague: [],
    },
    { layer: 'testing', proposals: [], keepLegacy: true, vague: [] },
  ],
};

describe('the stack options before the consent (catalogue proposals)', () => {
  it('RF-645 shows four options: recommended proposal first, second, keep legacy', () => {
    const options = questionOptions('stack.database', { catalogue, options: undefined, offer });
    expect(options.map((each) => each.title)).toEqual([
      'SQL Server',
      'PostgreSQL',
      'Keep the legacy technology',
    ]);
    expect(
      optionTitle(options[0] ?? { id: '', title: '', description: '', recommended: false }),
    ).toBe('SQL Server (Recommended)');
    expect(options.filter((each) => each.recommended)).toHaveLength(1);
    expect(options[0]?.description).toBe('The schema stays.');
  });

  it('DEC-203 leaves out keep legacy when the layer may not keep it', () => {
    const options = questionOptions('stack.hosting', { catalogue, options: undefined, offer });
    expect(options.map((each) => each.title)).toEqual(['Docker containers', 'Azure App Service']);
  });

  it('RF-609 a layer with no proposal still offers keep legacy only', () => {
    const options = questionOptions('stack.testing', { catalogue, options: undefined, offer });
    expect(options.map((each) => each.title)).toEqual(['Keep the legacy technology']);
  });
});

describe('the stack options after the consent (planner options)', () => {
  it('RF-645 the planner options replace the proposals', () => {
    const options = questionOptions('stack.database', { catalogue, options: planOptions, offer });
    const planned = planOptions.stack.find((each) => each.layer === 'database')?.options ?? [];
    expect(options.slice(0, planned.length).map((each) => each.title)).toEqual(planned);
  });

  it('DEC-203 the planner options also leave out keep legacy when not allowed', () => {
    const options = questionOptions('stack.hosting', { catalogue, options: planOptions, offer });
    expect(options.some((each) => each.id === 'keep-legacy')).toBe(false);
  });
});
