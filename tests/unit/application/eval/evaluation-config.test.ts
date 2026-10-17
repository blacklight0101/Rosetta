import { describe, expect, it } from 'vitest';
import { parseEvaluationConfig } from '../../../../src/application/eval/evaluation-config.js';

// RNF-015, RF-305: the optional `calibration` section of eval/config.json: the calibration set, the
// models that judge it and the cap of the whole calibration.

const base = {
  schemaVersion: 1,
  goldenSet: 'golden/eshop-webforms.json',
  repetitions: 3,
  roles: {},
  runCapMicros: 500_000,
  totalCapMicros: 1_500_000,
};

const calibration = {
  set: 'calibration/webforms-shop.json',
  models: [
    { provider: 'openai', model: 'gpt-5.6-luna' },
    { provider: 'openai', model: 'gpt-5-nano' },
  ],
  capMicros: 200_000,
};

describe('the calibration section of the evaluation settings', () => {
  it('RF-305 is optional, so a settings file without it stays valid', () => {
    expect(parseEvaluationConfig(base)).toMatchObject({ ok: true });
  });

  it('RF-305 names the set, the models and the cap', () => {
    const parsed = parseEvaluationConfig({ ...base, calibration });

    expect(parsed).toMatchObject({ ok: true, value: { calibration } });
  });

  it.each([
    ['no model', { ...calibration, models: [] }, 'calibration.models'],
    ['no cap', { ...calibration, capMicros: 0 }, 'calibration.capMicros'],
    ['no set', { ...calibration, set: '' }, 'calibration.set'],
    ['a model without a name', { ...calibration, models: [{ provider: 'openai' }] }, 'model'],
    ['an unknown key', { ...calibration, extra: 1 }, 'extra'],
  ])('RF-305 refuses %s', (_name, section, word) => {
    const parsed = parseEvaluationConfig({ ...base, calibration: section });

    expect(parsed.ok ? '' : parsed.error).toContain(word);
  });
});
