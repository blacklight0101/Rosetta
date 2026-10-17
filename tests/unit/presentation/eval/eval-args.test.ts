import { describe, expect, it } from 'vitest';
import { EVAL_USAGE, parseEvalArgs } from '../../../../src/presentation/eval/eval-args.js';

// RNF-015: the options of `npm run eval`: other models and more repetitions on the command line,
// everything else from the settings file.

describe('the options of npm run eval', () => {
  it('RNF-015 reads the settings file, the repetitions and the models of the roles', () => {
    const parsed = parseEvalArgs([
      '--config',
      'local.json',
      '--repetitions',
      '5',
      '--reader',
      'ollama:gemma4:e4b',
      '--verifier',
      'openai:gpt-5-nano',
    ]);

    expect(parsed).toEqual({
      ok: true,
      value: {
        config: 'local.json',
        repetitions: 5,
        help: false,
        yes: false,
        calibration: false,
        roles: {
          reader: { provider: 'ollama', model: 'gemma4:e4b' },
          verifier: { provider: 'openai', model: 'gpt-5-nano' },
        },
      },
    });
  });

  it('RNF-015 uses config.json and the settings models when nothing is given', () => {
    expect(parseEvalArgs([])).toEqual({
      ok: true,
      value: {
        ...{ config: 'config.json', roles: {}, help: false, yes: false, calibration: false },
      },
    });
    expect(parseEvalArgs(['--help'])).toMatchObject({ ok: true, value: { help: true } });
  });
});

describe('the refusals of npm run eval', () => {
  it.each([
    [['--repetitions', 'three'], 'three'],
    [['--repetitions', '-1'], '-1'],
    [['--reader', 'gpt-5-nano'], 'provider:model'],
    [['--reader', 'openai:'], 'provider:model'],
    [['--caps', '0'], 'unknown option'],
    [['--reader'], 'needs a value'],
  ])('RNF-015 refuses %j', (args, message) => {
    const parsed = parseEvalArgs(args);

    expect(parsed.ok ? '' : parsed.error).toContain(message);
  });
});

describe('the consent of npm run eval', () => {
  it('RF-143 RNF-006 starts the paid runs only with --yes, which the usage names', () => {
    expect(parseEvalArgs(['--yes', '--repetitions', '4'])).toMatchObject({
      ok: true,
      value: { yes: true, repetitions: 4 },
    });
    expect(EVAL_USAGE).toContain('--yes');
  });
});

describe('the calibration mode of npm run eval', () => {
  it('RF-305 reads --calibration, the settings file, a model for the verifier and --yes', () => {
    expect(
      parseEvalArgs(['--calibration', '--verifier', 'openai:gpt-5-nano', '--yes']),
    ).toMatchObject({
      ok: true,
      value: {
        calibration: true,
        yes: true,
        roles: { verifier: { provider: 'openai', model: 'gpt-5-nano' } },
      },
    });
    expect(EVAL_USAGE).toContain('--calibration');
  });

  it.each([
    [['--calibration', '--repetitions', '4']],
    [['--calibration', '--reader', 'openai:gpt-5-nano']],
    [['--calibration', '--summariser', 'openai:gpt-5-nano']],
  ])('RF-305 refuses %j: the mode judges claims, it runs no reader', (args) => {
    const parsed = parseEvalArgs(args);

    expect(parsed.ok ? '' : parsed.error).toContain('--calibration');
  });
});
