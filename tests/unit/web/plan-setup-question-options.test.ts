import { describe, expect, it } from 'vitest';
import {
  OPTION_QUESTIONS,
  OWN_ANSWER,
  optionTitle,
  questionOptions,
} from '../../../web/src/lib/plan-setup/question-options.js';
import { catalogue, planOptions } from './plan-setup-fixtures.js';

// RF-645, RF-605, DEC-178: every Plan setup question offers at least three options, the recommended
// one first and marked, each with a one-line description, and the same on every question.

const optionsOf = (id: string) => questionOptions(id, { catalogue, options: planOptions });

describe('the options of every Plan setup question', () => {
  it('RF-645 the questions are the ones of the six steps', () => {
    expect(OPTION_QUESTIONS).toContain('principles');
    expect(OPTION_QUESTIONS).toContain('migration');
    expect(OPTION_QUESTIONS).toContain('stack.database');
    expect(OPTION_QUESTIONS).toContain('context.deadline');
    expect(OPTION_QUESTIONS).toContain('buildMethod');
    expect(OPTION_QUESTIONS).toHaveLength(1 + 1 + 1 + 7 + 5 + 1);
  });

  it.each(OPTION_QUESTIONS.map((id) => [id]))(
    'RF-645 %s offers at least three options, each with a one-line description',
    (id) => {
      const options = optionsOf(id);

      expect(options.length).toBeGreaterThanOrEqual(3);
      for (const option of options) {
        expect(option.title.trim()).not.toBe('');
        expect(option.description.trim()).not.toBe('');
        expect(option.description).not.toContain('\n');
      }
      expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
    },
  );

  it.each(
    OPTION_QUESTIONS.filter((id) => id !== 'buildMethod' && id !== 'principles').map((id) => [id]),
  )('RF-645 %s has exactly one recommended option and it is listed first', (id) => {
    const options = optionsOf(id);

    expect(options.filter((option) => option.recommended)).toHaveLength(1);
    expect(options[0]?.recommended).toBe(true);
    expect(
      optionTitle(options[0] ?? { id: '', title: '', description: '', recommended: false }),
    ).toMatch(/ \(Recommended\)$/u);
  });
});

describe('the options of the questions with special cases', () => {
  it('RF-645 the recommended principles are listed before the others', () => {
    const options = optionsOf('principles');
    const flags = options.map((option) => option.recommended);

    expect(flags.some(Boolean)).toBe(true);
    expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
  });

  it('RF-645, DEC-176 the build method has no recommended option because it has no default', () => {
    const options = optionsOf('buildMethod');

    expect(options.map((option) => option.id)).toEqual(['agents', 'people', 'both']);
    expect(options.some((option) => option.recommended)).toBe(false);
  });

  it('RF-645 a question with two natural answers adds a qualified third, not filler', () => {
    const layer = optionsOf('stack.database');

    expect(layer.map((option) => option.id)).toEqual(['a', 'b', 'keep-legacy']);
    expect(layer[2]?.title).toBe('Keep the legacy technology');
  });

  it('RF-645 the recommended architecture style is the one the planner recommends, first', () => {
    const options = optionsOf('architecture');

    expect(options[0]?.id).toBe('modular-monolith');
    expect(options.map((option) => option.id)).toEqual(
      expect.arrayContaining(['hexagonal', 'layered']),
    );
  });

  it('RF-645 leaving a project-context question open is its recommended option', () => {
    const [first] = optionsOf('context.deadline');

    expect(first?.id).toBe('open');
    expect(first?.recommended).toBe(true);
    expect(first?.value).toBe('');
  });

  it('RF-645 the label of the own-answer choice is the same on every question', () => {
    expect(OWN_ANSWER).toBe('Type your own answer');
  });
});
