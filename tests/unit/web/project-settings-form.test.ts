import { describe, expect, it } from 'vitest';
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

describe('draftOf', () => {
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
});

describe('settingsOf', () => {
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

    expect(result.ok && 'maxTurns' in result.settings.roles.reader).toBe(false);
  });

  it('RF-002 refuses an amount too large to travel as a whole number of micro-dollars', () => {
    const settings = stored();

    const result = settingsOf(settings, { ...draftOf(settings), runCost: '99999999999999' });

    expect(result.ok ? [] : result.problems.map((problem) => problem.field)).toEqual([
      'budget.run.maxCostMicros',
    ]);
  });
});
