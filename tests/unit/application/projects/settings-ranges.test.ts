import { describe, expect, it } from 'vitest';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';

// RF-002 (second scenario), DEC-117, data-model.md section 3.1: every numeric setting has an
// allowed range. A value just outside it is refused with its field and RST-1006 (a cap below zero
// keeps RST-1003); the edge values are accepted. The template defaults stay as they are (DEC-116).

function problemsOf(input: unknown): readonly { field: string; code: string }[] {
  const result = parseProjectSettings(input);
  if (result.ok) return [];
  return result.error.map(({ field, code }) => ({ field, code }));
}

const RANGES = [
  ['agents.parallelism', 1, 8],
  ['scan.maxFileBytes', 1_000, 5_000_000],
  ['scan.areaTokenBudget', 4_000, 200_000],
  ['scan.excerptMaxLines', 20, 2_000],
  ['budget.run.maxTokens', 0, 50_000_000],
  ['roles.reader.maxOutputTokens', 256, 32_768],
  ['roles.verifier.maxOutputTokens', 256, 32_768],
  ['roles.planner.maxOutputTokens', 256, 32_768],
  ['roles.summariser.maxOutputTokens', 256, 32_768],
  ['roles.reader.maxTurns', 1, 50],
  ['providers.ollama.timeoutSeconds', 10, 600],
  ['providers.openai.maxRetries', 0, 5],
] as const;

/** Caps below zero keep their own code, RST-1003. */
const CAPS = new Set<string>(['budget.run.maxTokens']);

function belowCode(field: string): string {
  return CAPS.has(field) ? ERROR_CODES.settingsCapNegative : ERROR_CODES.settingValueInvalid;
}

describe('parseProjectSettings: allowed ranges (DEC-117)', () => {
  it.each(RANGES)('RF-002 %s accepts its edges %d and %d', (field, low, high) => {
    expect(problemsOf(settingsWith({ [field]: low }))).toEqual([]);
    expect(problemsOf(settingsWith({ [field]: high }))).toEqual([]);
  });

  it.each(RANGES)(
    'RF-002 %s (%d to %d) refuses one below the bottom with its field and code',
    (field, low) => {
      expect(problemsOf(settingsWith({ [field]: low - 1 }))).toEqual([
        { field, code: belowCode(field) },
      ]);
    },
  );

  it.each(RANGES)(
    'RF-002 %s (%d to %d) refuses one above the top with RST-1006',
    (field, _low, high) => {
      expect(problemsOf(settingsWith({ [field]: high + 1 }))).toEqual([
        { field, code: ERROR_CODES.settingValueInvalid },
      ]);
    },
  );
});

describe('parseProjectSettings: the run cost cap and the confirmation threshold', () => {
  const maxCost = 100_000_000;

  it('RF-002 the run cost cap accepts 0 and 100 USD', () => {
    const atZero = { 'budget.run.maxCostMicros': 0, 'budget.confirmAboveCostMicros': 0 };
    expect(problemsOf(settingsWith(atZero))).toEqual([]);
    expect(problemsOf(settingsWith({ 'budget.run.maxCostMicros': maxCost }))).toEqual([]);
  });

  it('RF-002 the run cost cap refuses one micro above 100 USD with RST-1006', () => {
    expect(problemsOf(settingsWith({ 'budget.run.maxCostMicros': maxCost + 1 }))).toEqual([
      { field: 'budget.run.maxCostMicros', code: ERROR_CODES.settingValueInvalid },
    ]);
  });

  it('RF-002 the confirmation threshold accepts 0 and the run cost cap itself', () => {
    const cap = { 'budget.run.maxCostMicros': 300_000 };
    expect(problemsOf(settingsWith({ ...cap, 'budget.confirmAboveCostMicros': 0 }))).toEqual([]);
    expect(problemsOf(settingsWith({ ...cap, 'budget.confirmAboveCostMicros': 300_000 }))).toEqual(
      [],
    );
  });

  it('RF-002 the confirmation threshold refuses one micro above the run cost cap', () => {
    const input = settingsWith({
      'budget.run.maxCostMicros': 300_000,
      'budget.confirmAboveCostMicros': 300_001,
    });

    expect(problemsOf(input)).toEqual([
      { field: 'budget.confirmAboveCostMicros', code: ERROR_CODES.settingValueInvalid },
    ]);
  });
});
