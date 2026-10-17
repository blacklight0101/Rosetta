import { describe, expect, it } from 'vitest';
import { stackLayers } from '../../../../src/domain/planning/planning-brief.js';
import { buildPlanOptions } from '../../../../src/domain/planning/plan-options.js';
import {
  styleDraft,
  validDraft,
  verifiedIds,
  withOptions,
  withStack,
} from '../../../support/plan-options-fixtures.js';

// RF-608, RF-609, ADR-005, ADR-013: the options come from a model, so the domain checks them: two
// known styles with trade-offs and evidence that names verified cards, one recommended; two
// different options for each of the seven layers.

function problemsOf(draft: Parameters<typeof buildPlanOptions>[0]): readonly string[] {
  const built = buildPlanOptions(draft, verifiedIds);
  return built.ok ? [] : built.error;
}

describe('the architecture options', () => {
  it('RF-608 gives two styles, the recommended one first, each with trade-offs and evidence', () => {
    const built = buildPlanOptions(validDraft(), verifiedIds);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { recommended, options } = built.value.architecture;
    expect(recommended).toBe('clean');
    expect(options.map((option) => option.style)).toEqual(['clean', 'layered']);
    expect(options[0].evidence).toEqual(['BR-001', 'FEAT-001']);
    expect(options[1].strengths).toHaveLength(1);
    expect(options[1].costs).toHaveLength(1);
  });

  it('RF-608 drops evidence that names no verified card and refuses a style left with none', () => {
    const kept = withOptions(validDraft(), [
      styleDraft('layered', { evidence: ['FEAT-001', 'FEAT-999', 'FEAT-001'] }),
      styleDraft('clean'),
    ]);
    const built = buildPlanOptions(kept, verifiedIds);
    const invented = withOptions(validDraft(), [
      styleDraft('layered', { evidence: ['FEAT-999'] }),
      styleDraft('clean'),
    ]);

    expect(built.ok && built.value.architecture.options[1].evidence).toEqual(['FEAT-001']);
    expect(problemsOf(invented)).toEqual(['The style layered cites no verified card.']);
  });
});

describe('the architecture options that are refused', () => {
  it('RF-608 refuses a style a reader of the catalogue does not know', () => {
    const options = [styleDraft('layered'), styleDraft('big-ball-of-mud')];
    const draft = withOptions(validDraft(), options, 'layered');

    expect(problemsOf(draft)).toEqual(['big-ball-of-mud is not an architecture style.']);
  });

  it.each([
    ['one style', [styleDraft('clean')], 'Two architecture styles are needed, not 1.'],
    [
      'three styles',
      [styleDraft('clean'), styleDraft('layered'), styleDraft('hexagonal')],
      'Two architecture styles are needed, not 3.',
    ],
    [
      'the same style twice',
      [styleDraft('clean'), styleDraft('clean')],
      'The style clean is offered twice.',
    ],
  ])('RF-608 refuses %s', (_name, options, problem) => {
    expect(problemsOf(withOptions(validDraft(), options))).toEqual([problem]);
  });

  it('RF-608 refuses a recommendation that is not one of the two styles', () => {
    const draft = withOptions(
      validDraft(),
      [styleDraft('layered'), styleDraft('clean')],
      'microservices',
    );

    expect(problemsOf(draft)).toEqual([
      'The recommended style microservices is not one of the two.',
    ]);
  });

  it('RF-608 refuses a style with no strength or no cost', () => {
    const draft = withOptions(validDraft(), [
      styleDraft('layered', { strengths: [] }),
      styleDraft('clean', { costs: [' '] }),
    ]);

    expect(problemsOf(draft)).toEqual([
      'The style layered lists no strength.',
      'The style clean lists no cost.',
    ]);
  });
});

describe('the stack options', () => {
  it('RF-609 gives two options for each layer, in the order of the layers', () => {
    const shuffled = [...validDraft().stack].reverse();
    const built = buildPlanOptions(withStack(validDraft(), shuffled), verifiedIds);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.stack.map((each) => each.layer)).toEqual([...stackLayers]);
    expect(built.value.stack[0]?.options).toEqual(['language-runtime A', 'language-runtime B']);
  });

  it('RF-609 refuses a layer the answer leaves out', () => {
    const stack = validDraft().stack.filter((each) => each.layer !== 'database');

    expect(problemsOf(withStack(validDraft(), stack))).toEqual([
      'The layer database has no options.',
    ]);
  });
});

describe('the stack options that are refused', () => {
  it('RF-609 refuses a layer with one option or two that are the same', () => {
    const stack = validDraft().stack.map((each) => {
      if (each.layer === 'hosting') return { ...each, options: ['Docker'] };
      if (each.layer === 'testing') return { ...each, options: ['Vitest', ' vitest '] };
      return each;
    });

    expect(problemsOf(withStack(validDraft(), stack))).toEqual([
      'The layer testing needs two different options.',
      'The layer hosting needs two different options.',
    ]);
  });

  it('RF-609 keeps the first two different options of a layer and bounds their length', () => {
    const long = 'x'.repeat(300);
    const stack = validDraft().stack.map((each) =>
      each.layer === 'front-end' ? { ...each, options: ['React', 'React', long, 'Vue'] } : each,
    );

    const built = buildPlanOptions(withStack(validDraft(), stack), verifiedIds);

    expect(built.ok && built.value.stack[2]?.options).toEqual(['React', 'x'.repeat(200)]);
  });
});
