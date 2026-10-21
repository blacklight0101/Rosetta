import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  loadModelList,
  parseModelList,
} from '../../../../src/infrastructure/models/model-list-file.js';

// RF-405, DEC-156: the shipped model list `prices/models.yaml` is dated, names the Anthropic models
// of the decision and the OpenAI models of the price table, and a bad file is refused, not guessed.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));

const valid = `
schemaVersion: 1
version: '2026-10-20'
models:
  - provider: anthropic
    model: claude-opus-5-5
    label: Claude Opus 5.5
`;

function refusal(text: string): unknown {
  try {
    parseModelList(text);
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
  return undefined;
}

describe('model list file', () => {
  it('RF-405 reads the version and each provider, model and label', () => {
    expect(parseModelList(valid)).toEqual({
      version: '2026-10-20',
      models: [{ provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5' }],
    });
  });

  it.each([
    ['text that is not YAML', 'models: [unclosed'],
    ['a version that is not a date', valid.replace('2026-10-20', 'today')],
    ['a model without a label', valid.replace('    label: Claude Opus 5.5\n', '')],
    ['a provider the list does not serve', valid.replace('anthropic', 'ollama')],
    ['a field it does not know', `${valid}    colour: red\n`],
    [
      'a model listed twice',
      `${valid}  - provider: anthropic\n    model: claude-opus-5-5\n    label: Again\n`,
    ],
  ])('RF-405 refuses %s with RST-1602', (_name, text) => {
    expect(refusal(text)).toBe(ERROR_CODES.priceTableInvalid);
  });

  it('RF-405 refuses a file that cannot be read with RST-1602', async () => {
    await expect(loadModelList(`${shipped}.missing`)).rejects.toMatchObject({
      code: ERROR_CODES.priceTableInvalid,
    });
  });

  it('RF-405 the shipped list is dated and holds the four Anthropic models of DEC-156', async () => {
    const list = await loadModelList(shipped);

    expect(list.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const anthropic = list.models.filter((entry) => entry.provider === 'anthropic');
    expect(anthropic.map(({ provider, model, label }) => ({ provider, model, label }))).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      { provider: 'anthropic', model: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
    ]);
    expect(anthropic.map((entry) => [entry.contextTokens, entry.maxOutputTokens])).toEqual(
      anthropic.map(() => [1_000_000, 128_000]),
    );
  });
});
