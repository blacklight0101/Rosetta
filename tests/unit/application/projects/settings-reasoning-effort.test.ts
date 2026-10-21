import { describe, expect, it } from 'vitest';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';

// RF-402, RF-405, RF-002, Q-58, P3-86: a role may set a reasoning effort of low, medium or high.
// A project saved before the setting existed has none and stays valid (the default, low, is
// applied where the request is made); any other value is refused with its field and RST-1006.

function problemsOf(input: unknown): readonly { field: string; code: string }[] {
  const result = parseProjectSettings(input);
  return result.ok ? [] : result.error.map(({ field, code }) => ({ field, code }));
}

describe('parseProjectSettings: reasoning effort (Q-58)', () => {
  it.each(['low', 'medium', 'high'])('RF-405 accepts %s on every role', (effort) => {
    for (const role of ['reader', 'verifier', 'planner', 'summariser']) {
      expect(problemsOf(settingsWith({ [`roles.${role}.reasoningEffort`]: effort }))).toEqual([]);
    }
  });

  it('RF-405 keeps a document without the setting valid', () => {
    expect(problemsOf(settingsWith({}))).toEqual([]);
  });

  it.each(['minimal', 'none', 'xhigh', 'max', 'LOW', '', 3])(
    'RF-002 refuses %j with its field and RST-1006',
    (value) => {
      expect(problemsOf(settingsWith({ 'roles.reader.reasoningEffort': value }))).toEqual([
        { field: 'roles.reader.reasoningEffort', code: ERROR_CODES.settingValueInvalid },
      ]);
    },
  );
});
