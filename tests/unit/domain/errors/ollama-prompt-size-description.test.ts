import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// RF-401, RF-007, DEC-155: RST-1522 is what a run ends with when a prompt is larger than the
// Ollama context; the run page shows its catalogue text, which names the remedies.

it('RF-007 RST-1522 is the next free providers code', () => {
  expect(ERROR_CODES.ollamaPromptTooLarge).toBe('RST-1522');
});

it('RF-401 RST-1522 names the context and the remedies', () => {
  const { message, nextStep } = describeError('RST-1522');

  expect(message).toMatch(/larger than the context/);
  expect(nextStep).toMatch(/larger context/);
  expect(nextStep).toMatch(/cloud model/);
  expect(nextStep).toMatch(/contextTokens/);
});
