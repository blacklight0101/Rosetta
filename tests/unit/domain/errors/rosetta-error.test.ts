import { describe, expect, it } from 'vitest';
import { describeError, ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';

describe('RosettaError', () => {
  it('RF-007 is an Error carrying its stable code', () => {
    const error = new RosettaError(ERROR_CODES.providerTimeout);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RosettaError');
    expect(error.code).toBe('RST-1505');
  });

  it('RF-007 takes the catalogue message and next step by default', () => {
    const error = new RosettaError(ERROR_CODES.providerRateLimited);
    const description = describeError(ERROR_CODES.providerRateLimited);

    expect(error.message).toBe(description.message);
    expect(error.nextStep).toBe(description.nextStep);
  });

  it('RF-007 accepts a more specific message', () => {
    const error = new RosettaError(ERROR_CODES.providerTimeout, 'timeout after 30 s, call #36');

    expect(error.message).toBe('timeout after 30 s, call #36');
  });

  it('RF-007 keeps the original failure as cause', () => {
    const original = new Error('socket hang up');
    const error = new RosettaError(ERROR_CODES.providerTimeout, undefined, { cause: original });

    expect(error.cause).toBe(original);
  });
});
