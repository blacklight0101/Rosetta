import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  boundedErrorText,
  maxErrorTextLength,
  networkErrorText,
  providerErrorText,
} from '../../../../src/infrastructure/providers/error-text.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-408, RF-140..RF-149: the provider's error text as the call record and the run log keep it.

const masker = new SecretMasker();

describe('providerErrorText', () => {
  it('RF-408 joins the provider error type and message', () => {
    expect(providerErrorText('invalid_request_error', 'Bad tools.')).toBe(
      'invalid_request_error: Bad tools.',
    );
  });

  it('RF-408 keeps the message alone when the provider names no type', () => {
    expect(providerErrorText(undefined, 'model failed to load')).toBe('model failed to load');
  });

  it('RF-408 keeps the type alone when there is no message', () => {
    expect(providerErrorText('overloaded_error', undefined)).toBe('overloaded_error');
  });

  it('RF-408 is undefined when the provider sent neither', () => {
    expect(providerErrorText(42, null)).toBeUndefined();
    expect(providerErrorText('', '  ')).toBeUndefined();
  });
});

describe('networkErrorText', () => {
  it('RF-408 keeps the error name and never its message', () => {
    class ConnectionReset extends Error {
      override name = 'ConnectionReset';
    }

    expect(networkErrorText(new ConnectionReset(`reset while using ${fakeOpenAiKey}`))).toBe(
      'ConnectionReset',
    );
    expect(networkErrorText('plain text')).toBeUndefined();
  });
});

describe('boundedErrorText', () => {
  it('RF-141 masks a secret-shaped value in the text', () => {
    const text = boundedErrorText(`Incorrect key provided: ${fakeOpenAiKey}.`, masker);

    expect(text).toContain('[MASKED:');
    expect(text).not.toContain(fakeOpenAiKey);
  });

  it('RF-408 cuts a 2 kB message to 500 characters with a marker', () => {
    const text = boundedErrorText('x'.repeat(2048), masker);

    expect(text).toHaveLength(maxErrorTextLength);
    expect(text?.endsWith('[cut]')).toBe(true);
  });

  it('RF-408 leaves a short message as it is', () => {
    expect(boundedErrorText('short', masker)).toBe('short');
  });

  it('RF-141 masks before it cuts, so a secret on the cut is never left half shown', () => {
    const text = boundedErrorText(`${'y'.repeat(470)} ${fakeOpenAiKey} tail`, masker) ?? '';

    expect(text).not.toContain(fakeOpenAiKey.slice(0, 12));
  });

  it('RNF-003 drops the text when the masker fails', () => {
    const failing = {
      mask: (): never => {
        throw new Error('masker down');
      },
    };

    expect(boundedErrorText('anything', failing)).toBeUndefined();
  });
});
