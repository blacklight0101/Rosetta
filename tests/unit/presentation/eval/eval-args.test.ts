import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from '../../../../src/presentation/eval/eval-args.js';

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
      value: { config: 'config.json', roles: {}, help: false },
    });
    expect(parseEvalArgs(['--help'])).toMatchObject({ ok: true, value: { help: true } });
  });

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
