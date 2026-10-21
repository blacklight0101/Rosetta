import { expect, it } from 'vitest';
import { parseProject } from '../../../web/src/api/projects.js';
import { draftOf, settingsOf } from '../../../web/src/pages/project-settings-form.js';
import { projectOf } from './project-fixtures.js';

// RF-002, DEC-116, DEC-117: the settings form turns the stored document into text fields and the
// fields back into the document. Dollars travel as micro-dollars, whole numbers stay whole, and a
// field that cannot be read is named with its path and never sent.

function stored() {
  const parsed = parseProject(projectOf('p-1', 'octo/demo'));
  if (parsed === undefined) throw new Error('The fixture project did not parse.');
  return parsed.settings;
}

it('DEC-116 shows caps in dollars and every other number as it is stored', () => {
  const draft = draftOf(stored());

  expect(draft.runCost).toBe('0.50');
  expect(draft.confirmAbove).toBe('0.25');
  expect(draft.runTokens).toBe('2000000');
  expect(draft.roles.reader).toEqual({
    provider: 'ollama',
    model: 'gemma4:e4b',
    maxOutputTokens: '4096',
    maxTurns: '12',
  });
  expect(draft.roles.verifier.maxTurns).toBe('');
  expect(draft.prices).toEqual([]);
});

it('RF-002 gives back the stored document when nothing changed', () => {
  const settings = stored();

  expect(settingsOf(settings, draftOf(settings))).toEqual({ ok: true, settings });
});

it('DEC-117 does not judge a range: a negative cap is sent for the server to refuse', () => {
  const settings = stored();
  const draft = { ...draftOf(settings), runTokens: '-1' };

  const result = settingsOf(settings, draft);

  expect(result.ok && result.settings.budget.run.maxTokens).toBe(-1);
});

it('RF-002 names every field it cannot read', () => {
  const settings = stored();
  const draft = {
    ...draftOf(settings),
    runTokens: '1.5',
    runCost: 'ten',
    roles: {
      ...draftOf(settings).roles,
      reader: { ...draftOf(settings).roles.reader, maxTurns: 'many' },
    },
  };

  const result = settingsOf(settings, draft);

  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.problems.map((problem) => problem.field)).toEqual([
    'roles.reader.maxTurns',
    'budget.run.maxCostMicros',
    'budget.run.maxTokens',
  ]);
});

it('RF-002 leaves the turn limit out when the field is empty', () => {
  const settings = stored();
  const draft = draftOf(settings);

  const result = settingsOf(settings, {
    ...draft,
    roles: { ...draft.roles, reader: { ...draft.roles.reader, maxTurns: '' } },
  });

  expect(result.ok && result.settings.roles.reader.maxTurns).toBeUndefined();
});

it('RF-002 refuses an amount too large to travel as a whole number of micro-dollars', () => {
  const settings = stored();

  const result = settingsOf(settings, { ...draftOf(settings), runCost: '99999999999999' });

  expect(result.ok ? [] : result.problems.map((problem) => problem.field)).toEqual([
    'budget.run.maxCostMicros',
  ]);
});

const claudeOverride = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 3_000_000,
  outputPerMillionMicros: 15_000_000,
  cachedInputPerMillionMicros: 300_000,
};

it('RF-420 shows a stored cache-write price in dollars and sends it back as micro-dollars', () => {
  const base = stored();
  const settings = {
    ...base,
    budget: {
      ...base.budget,
      prices: [{ ...claudeOverride, cacheWriteInputPerMillionMicros: 3_750_000 }],
    },
  };

  const draft = draftOf(settings);

  expect(draft.prices[0]?.cacheWrite).toBe('3.75');
  expect(settingsOf(settings, draft)).toEqual({ ok: true, settings });
});

it('RF-427 an empty cache-write field leaves the price out, never a zero', () => {
  const base = stored();
  const settings = { ...base, budget: { ...base.budget, prices: [claudeOverride] } };

  const draft = draftOf(settings);
  const result = settingsOf(settings, draft);

  expect(draft.prices[0]?.cacheWrite).toBe('');
  expect(result).toEqual({ ok: true, settings });
  expect(result.ok ? Object.keys(result.settings.budget.prices?.[0] ?? {}) : []).not.toContain(
    'cacheWriteInputPerMillionMicros',
  );
});

it('RF-002 names a cache-write price that is not an amount', () => {
  const base = stored();
  const settings = { ...base, budget: { ...base.budget, prices: [claudeOverride] } };
  const draft = draftOf(settings);
  const prices = draft.prices.map((price) => ({ ...price, cacheWrite: 'lots' }));

  const result = settingsOf(settings, { ...draft, prices });

  expect(result.ok ? [] : result.problems.map((problem) => problem.field)).toEqual([
    'budget.prices.0.cacheWriteInputPerMillionMicros',
  ]);
});

it('Q-57 shows an empty field for a role without an output limit and leaves it out again', () => {
  const settings = stored();
  const { provider, model, maxTurns } = settings.roles.reader;
  const reader = { provider, model, maxTurns };
  const unset = { ...settings, roles: { ...settings.roles, reader } };

  const draft = draftOf(unset);
  const result = settingsOf(unset, draft);

  expect(draft.roles.reader.maxOutputTokens).toBe('');
  expect(result).toEqual({ ok: true, settings: unset });
  expect(result.ok && 'maxOutputTokens' in result.settings.roles.reader).toBe(false);
});

it('Q-57 a number typed into the empty field is stored and text that is no number is named', () => {
  const settings = stored();
  const base = draftOf(settings);
  const typed = (maxOutputTokens: string) => ({
    ...base,
    roles: { ...base.roles, reader: { ...base.roles.reader, maxOutputTokens } },
  });

  const stored8k = settingsOf(settings, typed('8000'));
  const bad = settingsOf(settings, typed('lots'));

  expect(stored8k.ok && stored8k.settings.roles.reader.maxOutputTokens).toBe(8000);
  expect(bad.ok ? [] : bad.problems.map((problem) => problem.field)).toEqual([
    'roles.reader.maxOutputTokens',
  ]);
});
