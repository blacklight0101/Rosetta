import { describe, expect, it } from 'vitest';
import type { EvaluationConfig } from '../../../../src/application/eval/evaluation-config.js';
import {
  evaluationCaps,
  evaluationPlan,
  evaluationSettings,
} from '../../../../src/presentation/eval/eval-settings.js';
import { evalGoldenSet } from '../../../support/eval-target.js';
import { understandSettings } from '../../../support/understand-run-harness.js';

// RNF-006, RNF-015, ADR-007, RF-143: the settings of the evaluation's runs and the caps its budget
// guard enforces while they run: the run cap of the settings file bounds each run, the total cap
// bounds them all (the evaluation account's daily cap and the server caps), and no command-line
// option changes a cap. Before anything is sent the command shows what it would spend and where.

const config: EvaluationConfig = {
  schemaVersion: 1,
  goldenSet: 'golden/set.json',
  repetitions: 3,
  roles: {
    reader: { provider: 'openai', model: 'reader-model' },
    verifier: { provider: 'openai', model: 'judge-model' },
  },
  runCapMicros: 200_000,
  totalCapMicros: 600_000,
  parallelism: 2,
};

const cli = { config: 'config.json', help: false, yes: false, calibration: false };

describe('the settings of the evaluation runs', () => {
  it('ADR-007 takes the run cap from the settings file, never the total cap', () => {
    const settings = evaluationSettings(understandSettings(), config, { ...cli, roles: {} });

    expect(settings.budget.run.maxCostMicros).toBe(200_000);
    expect(settings.agents.parallelism).toBe(2);
  });

  it('RNF-015 lets the command line choose a model, keeping the others of the settings file', () => {
    const roles = { reader: { provider: 'ollama', model: 'gemma4:e4b' } };
    const settings = evaluationSettings(understandSettings(), config, { ...cli, roles });

    expect(settings.roles.reader).toMatchObject({ provider: 'ollama', model: 'gemma4:e4b' });
    expect(settings.roles.verifier).toMatchObject({ provider: 'openai', model: 'judge-model' });
    expect(settings.budget.run.maxCostMicros).toBe(200_000);
  });
});

describe('the caps of the evaluation', () => {
  it('ADR-007 sets the account day and the server caps to the total cap, each run to the run cap', () => {
    expect(evaluationCaps({ totalCapMicros: 600_000, runCapMicros: 200_000 })).toEqual({
      dailyCapMicros: 600_000n,
      runMicros: 200_000n,
      userDayMicros: 600_000n,
      serverMonthMicros: 600_000n,
    });
  });
});

describe('the plan shown before the evaluation', () => {
  it('RF-143 names the models, the caps, the repetitions and the source before anything is sent', () => {
    const settings = evaluationSettings(understandSettings(), config, { ...cli, roles: {} });
    const plan = evaluationPlan(
      { settings, totalCapMicros: 600_000, repetitions: 3 },
      evalGoldenSet,
    );
    const text = plan.join('\n');

    expect(text).toContain('reader: openai reader-model');
    expect(text).toContain('verifier: openai judge-model');
    expect(text).toContain('3 runs');
    expect(text).toContain('$0.20');
    expect(text).toContain('$0.60');
    expect(text).toContain(`https://github.com/octo/demo at ${'c'.repeat(40)}`);
  });
});
