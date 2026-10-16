import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { startFailure } from '../../../src/presentation/start-failure.js';

// RF-1305, RF-1302 (DEC-140): the one line each process of the image prints when it fails.

describe('start failure line', () => {
  it('RF-1305 a coded failure prints its code, message and next step', () => {
    const error = new RosettaError(ERROR_CODES.migrationPending);
    const line: unknown = JSON.parse(startFailure(error, 'start-up'));

    expect(line).toEqual({
      level: 'error',
      logger: 'start-up',
      code: 'RST-2405',
      message: error.message,
      nextStep: error.nextStep,
    });
    expect(error.nextStep).toContain('docker compose run --rm migrate');
  });

  it('RF-1302 an uncoded failure of the migrate step says the step failed, not that Rosetta could not start', () => {
    const line: unknown = JSON.parse(startFailure(new Error('connect refused'), 'migrate'));

    expect(line).toEqual({
      level: 'error',
      logger: 'migrate',
      message: 'The migrate step failed; see the log line above.',
    });
  });

  it('RF-1305 an uncoded failure of the server points to the application log, without its text', () => {
    const line: unknown = JSON.parse(startFailure(new Error('secret detail'), 'start-up'));

    expect(line).toEqual({
      level: 'error',
      logger: 'start-up',
      message: 'Rosetta could not start; see the application log.',
    });
  });
});
