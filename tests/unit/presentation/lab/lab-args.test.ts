import { describe, expect, it } from 'vitest';
import { parseLabArgs } from '../../../../src/presentation/lab/lab-args.js';

// RF-1400, RF-1403: the options of `npm run lab`.

const base = [
  ...['--prompt', 'verifier/claim', '--version', 'v5'],
  ...['--model', 'anthropic:claude-haiku-5-5', '--cases', 'verifier-claim-sample'],
];

describe('the lab options', () => {
  it('RF-1400 reads the prompt, version, model, cases, repetitions and consent', () => {
    const parsed = parseLabArgs([...base, '--repetitions', '2', '--yes']);

    expect(parsed).toEqual({
      ok: true,
      value: {
        kind: 'run',
        prompt: 'verifier/claim',
        version: 'v5',
        model: { provider: 'anthropic', model: 'claude-haiku-5-5' },
        cases: 'verifier-claim-sample',
        repetitions: 2,
        yes: true,
      },
    });
  });

  it('RF-1400 defaults to one repetition and no consent', () => {
    const parsed = parseLabArgs(base);
    const value = parsed.ok ? parsed.value : undefined;

    expect(value?.kind === 'run' ? [value.repetitions, value.yes] : []).toEqual([1, false]);
  });

  it('RF-1400 refuses a missing option, a model that is not provider:model and a count out of range', () => {
    expect(parseLabArgs(['--prompt', 'verifier/claim']).ok).toBe(false);
    const noColon = [...base.slice(0, 4), '--model', 'nocolon', '--cases', 'x'];
    expect(parseLabArgs(noColon).ok).toBe(false);
    expect(parseLabArgs([...base, '--repetitions', '0']).ok).toBe(false);
    expect(parseLabArgs([...base, '--repetitions', '99']).ok).toBe(false);
  });

  it('RF-1403 reads --compare with two run ids and takes no other option', () => {
    expect(parseLabArgs(['--compare', 'run-a', 'run-b'])).toEqual({
      ok: true,
      value: { kind: 'compare', a: 'run-a', b: 'run-b' },
    });
    expect(parseLabArgs(['--compare', 'run-a']).ok).toBe(false);
    expect(parseLabArgs(['--compare', 'run-a', 'run-b', '--yes']).ok).toBe(false);
  });
});

describe('the lab judge options', () => {
  it('RF-1407 reads --judge as a provider:model and leaves it out when absent', () => {
    const judged = parseLabArgs([...base, '--judge', 'anthropic:claude-opus-5-5']);
    const plain = parseLabArgs(base);

    expect(judged.ok && judged.value.kind === 'run' && judged.value.judge).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
    });
    expect(plain.ok && plain.value.kind === 'run' && 'judge' in plain.value).toBe(false);
    expect(parseLabArgs([...base, '--judge', 'nocolon']).ok).toBe(false);
  });

  it('RF-1408 reads --judge-check with a model and consent, and no other option', () => {
    expect(parseLabArgs(['--judge-check', 'fake:model-b', '--yes'])).toEqual({
      ok: true,
      value: { kind: 'judge-check', model: { provider: 'fake', model: 'model-b' }, yes: true },
    });
    expect(parseLabArgs(['--judge-check', 'fake:model-b'])).toMatchObject({
      value: { yes: false },
    });
    expect(parseLabArgs(['--judge-check', 'fake:model-b', '--limit', '2', '--yes'])).toMatchObject({
      value: { limit: 2, yes: true },
    });
    expect(parseLabArgs(['--judge-check', 'fake:model-b', '--limit', '0']).ok).toBe(false);
    expect(parseLabArgs(['--judge-check']).ok).toBe(false);
    expect(parseLabArgs(['--judge-check', 'fake:model-b', '--prompt', 'x']).ok).toBe(false);
  });
});
