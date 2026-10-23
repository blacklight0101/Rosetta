import { describe, expect, it } from 'vitest';
import { planEstimateSchema, briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import { chooseLayer, togglePrinciple } from '../../../web/src/lib/plan-setup/choices.js';
import { answersOf, draftOf, problemsOf } from '../../../web/src/lib/plan-setup/draft.js';
import {
  blockersOf,
  capFigure,
  needsConsent,
  overCaps,
} from '../../../web/src/lib/plan-setup/estimate.js';
import { recordedLines } from '../../../web/src/lib/plan-setup/recorded.js';
import { catalogue, planEstimate, unsavedBrief } from './plan-setup-fixtures.js';

// RF-605, RF-611, RF-613, RF-427, RF-143: the pure parts of Plan setup: what a save sends, what is
// wrong with a draft, the lines of "What I recorded" and what stops the plan run.

const draft = draftOf(briefViewSchema.parse(unsavedBrief).brief);
const estimate = planEstimateSchema.parse(planEstimate);

describe('plan setup draft', () => {
  it('RF-605 sends nothing for a brief on its defaults', () => {
    expect(answersOf(draft)).toEqual({});
  });

  it('RF-605 sends a principle toggled in catalogue order and nothing else', () => {
    const next = togglePrinciple(draft, catalogue, 'design-patterns', true);

    expect(answersOf(next)).toEqual({ principles: ['solid', 'kiss', 'design-patterns', 'tdd'] });
  });

  it('RF-609 drops a layer whose technology was cleared', () => {
    const picked = chooseLayer(draft, 'database', { choice: 'PostgreSQL', custom: true });
    const cleared = chooseLayer(picked, 'database', { choice: '  ', custom: true });

    expect(answersOf(picked).stack).toEqual([
      { layer: 'database', choice: 'PostgreSQL', custom: true },
    ]);
    expect(answersOf(cleared).stack).toBeUndefined();
  });

  it('RF-609 sends the options the page showed for the layer with the choice', () => {
    const picked = chooseLayer(draft, 'database', {
      choice: 'PostgreSQL 17',
      custom: false,
      offered: ['SQL Server 2022', 'PostgreSQL 17'],
    });

    expect(answersOf(picked).stack).toEqual([
      {
        layer: 'database',
        choice: 'PostgreSQL 17',
        custom: false,
        offered: ['SQL Server 2022', 'PostgreSQL 17'],
      },
    ]);
  });

  it('RF-611 names the questions that are too long or not a number', () => {
    const wrong = {
      ...draft,
      context: { ...draft.context, teamSize: '0', deadline: 'x'.repeat(501) },
    };

    expect(Object.keys(problemsOf(wrong))).toEqual(['context.teamSize', 'context.deadline']);
    expect(problemsOf(draft)).toEqual({});
  });
});

describe('what I recorded', () => {
  it('RF-605 marks the lines still on their default', () => {
    const lines = recordedLines(draft, catalogue);

    expect(lines.map((line) => line.key)).toEqual([
      'Principles',
      'Architecture',
      'Migration',
      'Stack',
      'Project context',
      'Build method',
    ]);
    expect(lines.filter((line) => line.isDefault).map((line) => line.key)).toEqual([
      'Principles',
      'Migration',
      'Project context',
      'Build method',
    ]);
  });
});

describe('plan estimate', () => {
  it('RF-427 and RF-2302 list what stops the run, in the catalogue codes', () => {
    expect(blockersOf(estimate)).toEqual([]);

    const unpriced = { ...estimate, planner: { ...estimate.planner, priced: false } };
    expect(blockersOf(unpriced).map((each) => each.code)).toEqual(['RST-1601']);
    expect(blockersOf({ ...unpriced, keyAvailable: false }).map((each) => each.code)).toEqual([
      'RST-1601',
      'RST-2302',
    ]);
  });

  it('RF-143 needs the consent of a planner that is not a local model', () => {
    expect(needsConsent('ollama')).toBe(false);
    expect(needsConsent('fake')).toBe(false);
    expect(needsConsent('anthropic')).toBe(true);
    expect(needsConsent('openai-compatible')).toBe(true);
  });

  it('RF-613 names the caps a figure would pass and writes token caps in tokens', () => {
    const cap = estimate.caps[0];
    if (cap === undefined) throw new Error('The fixture has a cap.');
    const over = {
      ...estimate,
      caps: [{ ...cap, fits: { low: true, likely: true, high: false } }],
    };

    expect(overCaps(over, 'high')).toHaveLength(1);
    expect(overCaps(over, 'likely')).toHaveLength(0);
    expect(capFigure({ ...cap, unit: 'tokens' }, 1_500_000n)).toBe('1,500,000 tokens');
  });
});
